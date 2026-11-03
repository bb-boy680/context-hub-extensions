import { describe, expect, it } from "vitest"

import type { PluginDisk, PluginDiskDeclaration, PluginDiskRoots, PluginJsonTools, PluginTools } from "../src/contracts.ts"
import { PLUGIN_ROOTS } from "../src/locations.ts"
import { createWorkBuddyInstaller } from "../src/installer.ts"
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
  const declaration: PluginDiskDeclaration = PLUGIN_ROOTS
  const roots: PluginDiskRoots = { declaration, config: "/config", plugins: "/plugins", workspace, library: "/library", platform: "posix" }
  const key = (ref: { root: string; path: string }) => `${ref.root}:${ref.path}`
  const disk: PluginDisk = {
    snapshotDirectory: async () => "fixture-snapshot",
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

// Synthetic registry based on the public examples cited in README; observation dates and client versions are unknown.
const record = (scope: string, extra: Record<string, unknown> = {}) => ({ scope, installPath: "/cache/demo", version: "1", ...extra })

describe("WorkBuddy plugin disk state", () => {
  it("accepts only the current registry and compares platform paths", () => {
    expect(installedIndex(json, JSON.stringify({ version: 2, plugins: { "demo@other": [record("user")] } })).plugins["demo@other"]).toHaveLength(1)
    for (const raw of ["{", '{"version":1,"plugins":{}}', '{"version":2,"plugins":{"a@b":{}}}']) {
      expect(() => installedIndex(json, raw)).toThrow()
    }
    expect(sameProject("C:\\Work\\App", "c:/work/app/", "win32")).toBe(true)
  })

  it("installs to both scopes, preserves false and removes only its records", async () => {
    const { tools, files } = fixture({
      "library:demo/.codebuddy-plugin/plugin.json": JSON.stringify({ name: "demo", version: "1.0.0" }),
      "library:.codebuddy-plugin/marketplace.json": JSON.stringify({ plugins: [{ name: "demo" }] }),
      "external:/library/demo/.codebuddy-plugin/plugin.json": JSON.stringify({ name: "demo", version: "1.0.0" }),
    })
    const installer = createWorkBuddyInstaller(json)
    await installer.install("demo", "user", tools)
    const state = () => JSON.parse(files.get("plugins:installed_plugins.json")!) as { plugins: Record<string, { scope: string }[]> }
    expect(state().plugins["demo@context-hub"]).toHaveLength(1)
    expect(JSON.parse(files.get("config:settings.json")!).enabledPlugins["demo@context-hub"]).toBe(true)
    await installer.setEnabled("demo@context-hub", "user", false, tools)
    await installer.install("demo", "user", tools)
    expect(JSON.parse(files.get("config:settings.json")!).enabledPlugins["demo@context-hub"]).toBe(false)
    expect(state().plugins["demo@context-hub"]).toHaveLength(1)
    await installer.install("demo", "project", tools)
    expect(state().plugins["demo@context-hub"]).toHaveLength(2)
    expect((await installer.held(tools))[0]?.enabled).toBeUndefined()
    await installer.remove("demo@context-hub", "user", tools)
    expect(state().plugins["demo@context-hub"]).toHaveLength(1)
    await installer.remove("demo@context-hub", "project", tools)
    expect(state().plugins["demo@context-hub"]).toBeUndefined()
  })

  it("refuses invalid manifests and external ownership without writing state", async () => {
    for (const manifest of [null, { name: "demo", version: "../bad" }, { name: "demo", version: "1", skills: "../outside" }, { name: "demo", version: "1", dependencies: ["another"] }]) {
      const initial: Record<string, string> = manifest === null ? {} : { "library:demo/.codebuddy-plugin/plugin.json": JSON.stringify(manifest) }
      const { tools, files } = fixture(initial)
      await expect(createWorkBuddyInstaller(json).install("demo", "user", tools)).rejects.toThrow()
      expect(files.has("plugins:installed_plugins.json")).toBe(false)
    }
    const { tools } = fixture({ "plugins:installed_plugins.json": JSON.stringify({ version: 2, plugins: { "demo@other": [record("user")] } }) })
    const installer = createWorkBuddyInstaller(json)
    expect((await installer.held(tools))[0]?.readOnly).toBe(true)
    await expect(installer.remove("demo@other", "user", tools)).rejects.toThrow("read-only")
  })
})
