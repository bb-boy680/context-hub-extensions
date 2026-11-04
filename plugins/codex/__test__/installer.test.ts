import { describe, expect, it } from "vitest"
import type { PluginDisk, PluginDiskRoots, PluginTools } from "../src/contracts.ts"
import { createCodexInstaller } from "../src/installer.ts"

const parseToml = (text: string): Record<string, unknown> => text.trim() === "" ? {} : JSON.parse(text) as Record<string, unknown>
const installer = createCodexInstaller({
  parseToml,
  setTomlEntry(text, table, name, values) {
    const doc = parseToml(text); const entries = (doc[table] ??= {}) as Record<string, unknown>; entries[name] = values
    return JSON.stringify(doc)
  },
  setTomlField(text, table, name, field, value) {
    const doc = parseToml(text); const entries = doc[table] as Record<string, Record<string, unknown>>; entries[name]![field] = value
    return JSON.stringify(doc)
  },
  clearTomlEntry(text, table, name) {
    const doc = parseToml(text); delete (doc[table] as Record<string, unknown>)[name]
    return JSON.stringify(doc)
  },
})
function fixture(initial = "") {
  const files = new Map<string, string>([["config:config.toml", initial], ["library:demo/.codex-plugin/plugin.json", '{"version":"1.2.3"}']])
  const versions = new Set<string>()
  const disk: PluginDisk = {
    roots: async (declaration): Promise<PluginDiskRoots> => ({ declaration, config: "/config", plugins: "/config/plugins", workspace: null, library: "/library", platform: "posix" }),
    read: async (_, ref) => files.get(`${ref.root}:${ref.path}`) ?? null,
    list: async (_, ref) => ref.path === "cache/context-hub/demo" ? [...versions].map((name) => ({ name, directory: true })) : [],
    removeDirectory: async () => { versions.clear() },
    commit: async (_, changes, copy) => {
      for (const change of changes) {
        const key = `${change.ref.root}:${change.ref.path}`
        if ((files.get(key) ?? null) !== change.before) throw new Error("conflict")
        if (change.after === null) files.delete(key); else files.set(key, change.after)
      }
      if (copy) { versions.clear(); versions.add(copy.destination.split("/").at(-1)!) }
    },
    run: async (scope, work) => work(await disk.roots(scope)),
  }
  const tools: PluginTools = {
    disk, packs: async () => [{ name: "demo", description: "Demo", version: "1.0" }], root: async () => "/library",
    syncMarketplace: async (indexes) => { for (const index of indexes) files.set(`library:${index.path}`, JSON.stringify(index.document)) },
    run: async () => { throw new Error("CLI called") }, has: async () => { throw new Error("CLI called") }, files: null,
    describe: async (_, name) => ({ name, version: "", description: "" }),
  }
  return { tools, files, versions }
}

describe("Codex plugin files", () => {
  it("installs, switches and removes without the CLI", async () => {
    const { tools, versions, files } = fixture()
    expect(await installer.available(tools)).toBe(true)
    await installer.install("demo", "user", tools)
    expect([...versions]).toEqual(["1.2.3"])
    expect((await installer.held(tools))[0]).toMatchObject({ id: "demo@context-hub", enabled: true, version: "1.2.3" })
    await installer.setEnabled!("demo@context-hub", "user", false, tools)
    expect(await installer.switches!(tools)).toEqual({ user: { "demo@context-hub": false } })
    await installer.remove("demo@context-hub", "user", tools)
    expect(await installer.held(tools)).toEqual([])
    expect(versions.size).toBe(0)
    expect(parseToml(files.get("config:config.toml")!).marketplaces).toBeDefined()
  })
  it("treats a verbatim marketplace path as the same directory", async () => {
    const { tools } = fixture(JSON.stringify({ marketplaces: { "context-hub": { source_type: "local", source: "\\\\?\\/library" } } }))
    await expect(installer.install("demo", "user", tools)).resolves.toBeTruthy()
  })
  it("uses the default switch and keeps external plugins read-only", async () => {
    const { tools, versions } = fixture(JSON.stringify({ plugins: { _default: { enabled: false }, "demo@context-hub": {} } }))
    versions.add("1.0")
    expect((await installer.held(tools))[0]).toMatchObject({ enabled: false, readOnly: false })
    await expect(installer.setEnabled!("demo@outside", "user", true, tools)).rejects.toThrow(/another marketplace/)
  })
  it("refuses another marketplace and conflicting registration", async () => {
    const { tools } = fixture(JSON.stringify({ marketplaces: { "context-hub": { source_type: "local", source: "/other" } } }))
    await expect(installer.install("demo", "user", tools)).rejects.toThrow(/another directory/)
    await expect(installer.remove("demo@elsewhere", "user", tools)).rejects.toThrow(/another marketplace/)
  })
})
