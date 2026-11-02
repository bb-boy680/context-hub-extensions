import { describe, expect, it } from "vitest"

import type { PluginDisk, PluginDiskDeclaration, PluginDiskRoots, PluginJsonTools, PluginTools } from "../src/contracts.ts"
import { CLAUDE_PLUGIN_ROOTS } from "../src/locations.ts"
import { createClaudeCodeInstaller } from "../src/installer.ts"
import { installedIndex, sameProject } from "../src/plugin-state.ts"

const json: PluginJsonTools = {
  readJsonObject(text) {
    if (text === null) return null
    const value: unknown = JSON.parse(text)
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("not an object")
    return value as Record<string, unknown>
  },
  editJson(text, keys, value) {
    const doc = text === null ? {} : JSON.parse(text) as Record<string, unknown>
    let parent = doc
    for (const key of keys.slice(0, -1)) {
      const word = String(key)
      if (typeof parent[word] !== "object" || parent[word] === null) parent[word] = {}
      parent = parent[word] as Record<string, unknown>
    }
    const last = String(keys.at(-1))
    if (value === undefined) delete parent[last]
    else parent[last] = value
    return `${JSON.stringify(doc, null, 2)}\n`
  },
}

function fixture(initial: Record<string, string> = {}, workspace: string | null = "/workspace") {
  const files = new Map(Object.entries(initial))
  const declaration: PluginDiskDeclaration = CLAUDE_PLUGIN_ROOTS
  const roots: PluginDiskRoots = { declaration, config: "/config", plugins: "/plugins", workspace, library: "/library", platform: "posix" }
  const key = (ref: { root: string; path: string }) => `${ref.root}:${ref.path}`
  const disk: PluginDisk = {
    roots: async () => roots,
    read: async (_, ref) => files.get(key(ref)) ?? null,
    list: async (_, ref) => {
      const prefix = `${key(ref)}/`
      const names = new Set([...files.keys()].filter((file) => file.startsWith(prefix)).map((file) => file.slice(prefix.length).split("/")[0]!))
      return [...names].map((name) => ({ name, directory: true }))
    },
    path: async (_, ref) => `${roots[ref.root]}/${ref.path}`,
    external: async (_, directory, relative) => `${directory}/${relative}`,
    readExternal: async (_, directory, relative) => files.get(`external:${directory}/${relative}`) ?? null,
    commit: async (_, changes) => {
      for (const change of changes) {
        if ((files.get(key(change.ref)) ?? null) !== change.before) throw new Error("conflict")
      }
      for (const change of changes) {
        if (change.after === null) files.delete(key(change.ref))
        else files.set(key(change.ref), change.after)
      }
    },
    run: async (_, work) => work(roots),
  }
  const tools: PluginTools = {
    disk,
    root: async () => roots.library,
    packs: async () => [],
    syncMarketplace: async () => undefined,
    describe: async (_directory, name) => ({ name, version: "", description: "" }),
    ...{ run: () => { throw new Error("CLI was called") }, has: () => { throw new Error("CLI was called") } },
  }
  return { tools, files, roots }
}

const record = (scope: string, extra: Record<string, unknown> = {}) => ({ scope, installPath: "/cache/demo", version: "1", ...extra })

describe("Claude plugin files", () => {
  it("reads v1 and v2 and rejects damaged or future indexes", () => {
    expect(installedIndex(json, JSON.stringify({ version: 1, plugins: { "demo@other": record("user") } })).plugins["demo@other"]).toHaveLength(1)
    expect(installedIndex(json, JSON.stringify({ version: 2, plugins: { "demo@other": [record("user")] } })).plugins["demo@other"]).toHaveLength(1)
    for (const raw of ["{", '{"version":3,"plugins":{}}', '{"version":2,"plugins":{"a@b":{}}}', ""]) {
      expect(() => installedIndex(json, raw)).toThrow()
    }
  })

  it("compares project paths using the host platform", () => {
    expect(sameProject("C:\\Work\\App", "c:/work/app/", "win32")).toBe(true)
    expect(sameProject("/Work/App", "/work/app", "posix")).toBe(false)
  })

  it("reads records, declarations and skills directories without calling the CLI", async () => {
    const { tools } = fixture({
      "plugins:installed_plugins.json": JSON.stringify({ version: 2, plugins: {
        "demo@other": [record("user"), record("project", { projectPath: "/workspace" }), record("project", { projectPath: "/elsewhere" }), record("local", { projectPath: "/workspace" })],
        "policy@synced": [record("managed")],
        "session@inline": [record("session")],
      } }),
      "plugins:known_marketplaces.json": JSON.stringify({ other: { source: { source: "directory", path: "/market" } } }),
      "external:/market/.claude-plugin/marketplace.json": JSON.stringify({ plugins: [{ name: "demo", source: "./demo" }, { name: "declared", source: "./declared" }] }),
      "config:settings.json": JSON.stringify({ enabledPlugins: { "demo@other": false } }),
      "workspace:.claude/settings.json": JSON.stringify({ enabledPlugins: { "demo@other": true, "declared@other": true } }),
      "workspace:.claude/settings.local.json": JSON.stringify({ enabledPlugins: { "demo@other": false } }),
      "config:skills/skill-plugin/.claude-plugin/plugin.json": JSON.stringify({ name: "skill-plugin" }),
      "config:skills/ordinary/SKILL.md": "ordinary",
    })
    const installer = createClaudeCodeInstaller(json)
    expect(await installer.available(tools)).toBe(true)
    const held = await installer.held(tools)
    expect(held.filter((entry) => entry.id === "demo@other").map((entry) => [entry.scope, entry.enabled, entry.readOnly])).toEqual([
      ["user", false, false], ["project", false, false], ["local", false, true],
    ])
    expect(held.find((entry) => entry.id === "demo@other")?.source?.path).toBe("/market/demo")
    expect(held.find((entry) => entry.id === "declared@other")).toMatchObject({ scope: "project", origin: "declaration", enabled: true })
    expect(held.find((entry) => entry.id === "skill-plugin@skills-dir")).toMatchObject({ origin: "skills-dir", readOnly: true })
    expect(held.find((entry) => entry.id === "policy@synced")?.readOnly).toBe(true)
    expect(held.some((entry) => entry.name === "ordinary" || entry.scope === "session")).toBe(false)
    expect((await installer.switches(tools)).project?.["demo@other"]).toBe(true)
  })

  it("resolves a marketplace entry whose source is its own directory", async () => {
    const { tools } = fixture({
      "plugins:installed_plugins.json": JSON.stringify({ version: 2, plugins: { "demo@other": [record("user")] } }),
      "plugins:known_marketplaces.json": JSON.stringify({ other: { source: { source: "directory", path: "/market" } } }),
      "external:/market/.claude-plugin/marketplace.json": JSON.stringify({ plugins: [{ name: "demo", source: "./" }] }),
    })
    const held = await createClaudeCodeInstaller(json).held(tools)
    expect(held.find((entry) => entry.id === "demo@other")?.source?.path).toBe("/market")
  })

  it("keeps reading a pack when its marketplace manifest is unusable", async () => {
    const { tools } = fixture({
      "plugins:installed_plugins.json": JSON.stringify({ version: 2, plugins: { "demo@other": [record("user")] } }),
      "plugins:known_marketplaces.json": JSON.stringify({ other: { source: { source: "directory", path: "/market" } } }),
      "external:/market/.claude-plugin/marketplace.json": "{",
    })
    const held = await createClaudeCodeInstaller(json).held(tools)
    expect(held.find((entry) => entry.id === "demo@other")?.source?.path).toBe("/cache/demo")
  })

  it("installs, shares a cache, switches and uninstalls without CLI calls", async () => {
    const { tools, files } = fixture({
      "library:demo/.claude-plugin/plugin.json": JSON.stringify({ name: "demo", version: "1.0.0" }),
      "library:.claude-plugin/marketplace.json": JSON.stringify({ plugins: [{ name: "demo", version: "1.0.0" }] }),
    })
    const installer = createClaudeCodeInstaller(json)
    await installer.install("demo", "user", tools)
    const readIndex = () => JSON.parse(files.get("plugins:installed_plugins.json")!) as { plugins: Record<string, { scope: string; installedAt: string }[]> }
    const first = readIndex().plugins["demo@context-hub"]![0]!
    expect(first.scope).toBe("user")
    expect(JSON.parse(files.get("config:settings.json")!)).toMatchObject({ enabledPlugins: { "demo@context-hub": true }, extraKnownMarketplaces: { "context-hub": { source: { path: "/library" } } } })
    await installer.install("demo", "user", tools)
    expect(readIndex().plugins["demo@context-hub"]).toHaveLength(1)
    expect(readIndex().plugins["demo@context-hub"]![0]!.installedAt).toBe(first.installedAt)
    await installer.install("demo", "project", tools)
    expect(readIndex().plugins["demo@context-hub"]).toHaveLength(2)
    await installer.setEnabled("demo@context-hub", "project", false, tools)
    expect(JSON.parse(files.get("workspace:.claude/settings.json")!).enabledPlugins["demo@context-hub"]).toBe(false)
    await installer.remove("demo@context-hub", "user", tools)
    expect(readIndex().plugins["demo@context-hub"]).toHaveLength(1)
    expect(files.has("plugins:cache/context-hub/demo/1.0.0/.orphaned_at")).toBe(false)
    await installer.remove("demo@context-hub", "project", tools)
    expect(readIndex().plugins["demo@context-hub"]).toBeUndefined()
    expect(files.get("plugins:cache/context-hub/demo/1.0.0/.orphaned_at")).toMatch(/^\d+$/)
    await installer.install("demo", "user", tools)
    expect(files.has("plugins:cache/context-hub/demo/1.0.0/.orphaned_at")).toBe(false)
  })

  it("removes a local declaration without inventing an installation record", async () => {
    const { tools, files } = fixture({
      "plugins:known_marketplaces.json": JSON.stringify({ other: { source: { source: "directory", path: "/market" } } }),
      "external:/market/.claude-plugin/marketplace.json": JSON.stringify({ plugins: [{ name: "declared", source: "./declared" }] }),
      "workspace:.claude/settings.json": JSON.stringify({ enabledPlugins: { "declared@other": true } }),
    })
    await createClaudeCodeInstaller(json).remove("declared@other", "project", tools)
    expect(JSON.parse(files.get("workspace:.claude/settings.json")!).enabledPlugins["declared@other"]).toBeUndefined()
    expect(files.has("plugins:installed_plugins.json")).toBe(false)
  })

  it("refuses dependencies and missing workspace before changing files", async () => {
    const { tools, files } = fixture({
      "library:demo/.claude-plugin/plugin.json": JSON.stringify({ name: "demo", dependencies: [{ name: "other", version: "^1" }] }),
      "library:.claude-plugin/marketplace.json": JSON.stringify({ plugins: [{ name: "demo" }] }),
    }, null)
    const installer = createClaudeCodeInstaller(json)
    const before = [...files]
    await expect(installer.install("demo", "project", tools)).rejects.toThrow(/workspace/)
    await expect(installer.install("demo", "user", tools)).rejects.toThrow(/depends on other/)
    expect([...files]).toEqual(before)
  })

  it("does not disable or remove a dependency of an enabled plugin", async () => {
    const { tools } = fixture({
      "plugins:installed_plugins.json": JSON.stringify({ version: 2, plugins: {
        "base@other": [record("user", { installPath: "/cache/base" })],
        "dependent@other": [record("user", { installPath: "/cache/dependent" })],
      } }),
      "config:settings.json": JSON.stringify({ enabledPlugins: { "base@other": true, "dependent@other": true } }),
      "external:/cache/dependent/.claude-plugin/plugin.json": JSON.stringify({ dependencies: [{ name: "base", version: "^1" }] }),
    })
    const installer = createClaudeCodeInstaller(json)
    await expect(installer.setEnabled("base@other", "user", false, tools)).rejects.toThrow(/required by enabled plugin/)
    await expect(installer.remove("base@other", "user", tools)).rejects.toThrow(/required by enabled plugin/)
  })

  it("does not change an identity also controlled by managed policy", async () => {
    const { tools, files } = fixture({
      "plugins:installed_plugins.json": JSON.stringify({ version: 2, plugins: {
        "base@other": [record("user"), record("managed")],
      } }),
      "config:settings.json": JSON.stringify({ enabledPlugins: { "base@other": true } }),
    })
    const installer = createClaudeCodeInstaller(json)
    expect((await installer.held(tools)).every((entry) => entry.readOnly)).toBe(true)
    const before = [...files]
    await expect(installer.remove("base@other", "user", tools)).rejects.toThrow(/managed policy/)
    await expect(installer.setEnabled("base@other", "user", false, tools)).rejects.toThrow(/managed policy/)
    expect([...files]).toEqual(before)
  })

  it("reports unreadable state instead of replacing it with an empty library", async () => {
    const { tools } = fixture({ "plugins:installed_plugins.json": "{" })
    await expect(createClaudeCodeInstaller(json).held(tools)).rejects.toThrow(/cannot read/)
    const oldHost = { ...tools, disk: undefined }
    await expect(createClaudeCodeInstaller(json).available(oldHost)).rejects.toThrow(/does not support/)
  })
})
