/* eslint-disable @typescript-eslint/no-explicit-any -- JSON fixture is edited dynamically */
import { describe, expect, it } from "vitest"
import { createCopilotInstaller } from "../src/installer.ts"
import type { PluginDisk, PluginDiskRoots, PluginTools } from "../src/contracts.ts"

const parse = (text: string | null): Record<string, any> | null => text?.trim() ? JSON.parse(text) : null
const editJson = (text: string, path: string[], value: unknown) => {
  const doc = parse(text) ?? {}; let cursor = doc
  for (const key of path.slice(0, -1)) cursor = cursor[key] ??= {}
  if (value === undefined) delete cursor[path.at(-1)!]; else cursor[path.at(-1)!] = value
  return JSON.stringify(doc)
}
const installer = createCopilotInstaller({ readJsonObject: parse, editJson })
function fixture() {
  const files = new Map<string, string>([["library:demo/plugin.json", JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.1.0/plugin.schema.json", name: "demo", version: "1.0" })]])
  const disk: PluginDisk = {
    roots: async (declaration): Promise<PluginDiskRoots> => ({ declaration, config: "/config", plugins: "/config/installed-plugins", workspace: "/workspace", library: "/library", platform: "posix" }),
    read: async (_, ref) => files.get(`${ref.root}:${ref.path}`) ?? null,
    list: async () => [], removeDirectory: async () => { throw new Error("unexpected directory removal") },
    commit: async (_, changes, copy) => {
      if (copy) throw new Error("unexpected copy")
      for (const change of changes) {
        const key = `${change.ref.root}:${change.ref.path}`
        if ((files.get(key) ?? null) !== change.before) throw new Error("conflict")
        if (change.after === null) files.delete(key); else files.set(key, change.after)
      }
    },
    run: async (scope, work) => work(await disk.roots(scope)),
  }
  const tools: PluginTools = {
    disk, files: null, root: async () => "/library", packs: async () => [{ name: "demo", description: "test", version: "1.0" }],
    syncMarketplace: async (indexes) => { for (const index of indexes) files.set(`library:${index.path}`, JSON.stringify(index.document)) },
    run: async () => { throw new Error("CLI called") }, has: async () => { throw new Error("CLI called") },
    describe: async (_, name) => ({ name, version: "1.0", description: "test" }),
  }
  return { files, tools }
}
describe("declarative Copilot plugin installation", () => {
  it("installs, overrides and removes only declarations", async () => {
    const { files, tools } = fixture()
    expect(await installer.available(tools)).toBe(true)
    await installer.install("demo", "user", tools)
    expect(parse(files.get("config:settings.json")!)?.extraKnownMarketplaces["context-hub"].source.path).toBe("/library")
    expect((await installer.held(tools))[0]).toMatchObject({ id: "demo@context-hub", enabled: true, origin: "declaration" })
    await installer.setEnabled!("demo@context-hub", "project", false, tools)
    expect(await installer.switches!(tools)).toMatchObject({ user: { "demo@context-hub": true }, project: { "demo@context-hub": false } })
    expect((await installer.held(tools)).map((v) => v.enabled)).toEqual([undefined, false])
    await installer.remove("demo@context-hub", "project", tools)
    await installer.remove("demo@context-hub", "user", tools)
    expect(await installer.held(tools)).toEqual([])
    expect(files.has("library:demo/plugin.json")).toBe(true)
  })
  it("reports a source that exists even if its description cannot be read", async () => {
    const { tools } = fixture()
    tools.describe = async () => { throw new Error("description unavailable") }
    await installer.install("demo", "user", tools)
    expect((await installer.held(tools))[0]).toMatchObject({ sourceAvailable: true, enabled: true, readOnly: false, pack: { name: "demo", version: "1.0" } })
  })
  it("reports a settings failure after updating the marketplace without touching other scopes", async () => {
    const { files, tools } = fixture()
    const user = JSON.stringify({ unrelated: true })
    const project = JSON.stringify({ enabledPlugins: { "other@context-hub": true } })
    files.set("config:settings.json", user)
    files.set("workspace:.github/copilot/settings.json", project)
    tools.disk!.commit = async () => { throw new Error("simulated conflict") }
    await expect(installer.install("demo", "project", tools)).rejects.toThrow(/marketplace index may have been updated.*Check the declaration and index before retrying.*simulated conflict/)
    expect(files.get("config:settings.json")).toBe(user)
    expect(files.get("workspace:.github/copilot/settings.json")).toBe(project)
    expect(parse(files.get("library:marketplace.json")!)?.plugins[0].name).toBe("demo")
  })
  it("does not edit a missing source or conflicting marketplace", async () => {
    const { files, tools } = fixture()
    await installer.install("demo", "user", tools)
    files.delete("library:marketplace.json")
    const before = files.get("config:settings.json")
    await expect(installer.remove("demo@context-hub", "user", tools)).rejects.toThrow(/unavailable/)
    expect(files.get("config:settings.json")).toBe(before)
    files.set("library:marketplace.json", JSON.stringify({ name: "someone-else", plugins: [] }))
    await expect(installer.install("demo", "user", tools)).rejects.toThrow(/another owner/)
  })
  it("keeps missing sources visible and refuses shadowed or legacy entries", async () => {
    const { files, tools } = fixture()
    await installer.install("demo", "user", tools)
    files.delete("library:marketplace.json")
    expect((await installer.held(tools))[0]).toMatchObject({ origin: "declaration", enabled: undefined, readOnly: true, sourceAvailable: false, pack: { name: "" } })
    files.set("workspace:.github/copilot/settings.local.json", '{"enabledPlugins":{"demo@context-hub":false}}')
    await expect(installer.remove("demo@context-hub", "user", tools)).rejects.toThrow(/controlled/)
    const before = files.get("config:settings.json")
    files.set("library:demo/plugin.json", '{"name":"demo"}')
    await expect(installer.install("demo", "user", tools)).rejects.toThrow()
    expect(files.get("config:settings.json")).toBe(before)
  })
})
