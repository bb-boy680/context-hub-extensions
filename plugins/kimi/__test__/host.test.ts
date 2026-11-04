import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import type { McpIo, McpTools, PromptFiles, PromptTools } from "../src/contracts.ts"
import type { PluginDisk, PluginTools } from "../src/plugin-contracts.ts"
import { createKimiMcp } from "../src/provider.ts"
import { createKimiPrompts } from "../src/prompts.ts"
import { createKimiInstaller } from "../src/installer.ts"

const checkout = process.env.CONTEXT_HUB_CHECKOUT
const suite = checkout ? describe : describe.skip
const trees: string[] = []
let mcpTools: McpTools, promptTools: PromptTools
let createFiles: (opts: { home: string; folder: string; userHome: string }) => PromptFiles
let createDisk: (opts: unknown) => PluginDisk
let collectScanned: (answers: unknown[]) => unknown[]
let composeRows: (records: unknown[], scanned: unknown[], language: string, t: (key: string) => string) => { name: string; held: { places: { id: string }[] }[] }[]
let placesShown: (row: unknown, clients: unknown[]) => unknown[]

suite("Kimi with host file ports", () => {
  beforeAll(async () => {
    if (!checkout || !path.isAbsolute(checkout)) throw new Error("CONTEXT_HUB_CHECKOUT must be absolute")
    const load = (file: string) => import(pathToFileURL(path.join(checkout, file)).href)
    const [mcp, prompts, files, installer, rows] = await Promise.all([
      load("packages/resources/mcp/src/toolkit.ts"), load("packages/resources/prompts/src/toolkit.ts"),
      load("packages/core/src/host/place-files.ts"), load("packages/resources/plugins/src/host/installer-files.ts"),
      load("packages/resources/plugins/src/rows.ts"),
    ])
    mcpTools = mcp.mcpTools
    promptTools = prompts.promptTools
    createFiles = files.createFsPlaceFiles
    createDisk = installer.createInstallerFiles
    collectScanned = rows.collectScanned
    composeRows = rows.composeRows
    placesShown = rows.placesShown
  })
  afterEach(async () => { await Promise.all(trees.splice(0).map((tree) => rm(tree, { recursive: true, force: true }))) })
  async function fixture() {
    const root = await mkdtemp(path.join(tmpdir(), "kimi-hub-")); trees.push(root)
    const home = path.join(root, "hub"), folder = path.join(root, "project"), userHome = path.join(root, "user")
    await Promise.all([home, folder, userHome].map((dir) => mkdir(dir, { recursive: true })))
    const files = createFiles({ home, folder, userHome })
    return { root, home, folder, userHome, files }
  }
  async function put(file: string, contents: string) {
    await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, contents)
  }

  it("writes both MCP scopes, preserves unknown fields and rejects unsafe transport changes", async () => {
    const f = await fixture()
    const io: McpIo = { files: f.files, log: () => {} }
    const mcp = createKimiMcp(mcpTools)
    const server = { transport: "stdio" as const, command: "node", args: ["a"], env: {} }
    await mcp.install(io, "kimi-mcp-project", "demo", server)
    const file = path.join(f.folder, ".kimi-code/mcp.json")
    let doc = JSON.parse(await readFile(file, "utf8"))
    expect(doc.mcpServers.demo.command).toBe("node")
    await put(file, '{\n  // keep this comment\n  "other": true,\n  "mcpServers": { "demo": { "command": "node", "enabled": false, "cwd": "/custom" } }\n}')
    await mcp.install(io, "kimi-mcp-project", "demo", { ...server, args: ["b"] })
    const text = await readFile(file, "utf8")
    expect(text).toContain("// keep this comment")
    expect(text).toContain('"cwd": "/custom"')
    expect((await mcp.read(io, "kimi-mcp-project"))[0]?.enabled).toBe(false)
    await expect(mcp.install(io, "kimi-mcp-project", "demo", { transport: "http", url: "https://example.test/mcp", headers: {} })).rejects.toThrow()
    expect(await readFile(file, "utf8")).toBe(text)
    await mcp.setEnabled!(io, "kimi-mcp-project", "workspace", "demo", true)
    expect((await mcp.read(io, "kimi-mcp-project"))[0]?.enabled).toBe(true)
    expect(await readFile(file, "utf8")).not.toContain('"enabled"')
    await mcp.setEnabled!(io, "kimi-mcp-project", "workspace", "demo", false)
    expect((await mcp.read(io, "kimi-mcp-project"))[0]?.enabled).toBe(false)
    await expect(mcp.setEnabled!(io, "kimi-mcp-project", "workspace", "missing", false)).rejects.toThrow()
    expect(await mcp.locate!(io, "kimi-mcp-project", "demo")).not.toBeNull()
    await mcp.install(io, "kimi-mcp-global", "remote", { transport: "sse", url: "https://example.test/sse", headers: {} })
    const globalFile = path.join(f.userHome, ".kimi-code/mcp.json")
    doc = JSON.parse(await readFile(globalFile, "utf8"))
    expect(doc.mcpServers.remote.transport).toBe("sse")
    await mcp.uninstall(io, "kimi-mcp-global", "remote")
    expect(await mcp.read(io, "kimi-mcp-global")).toEqual([])
    await put(globalFile, "{")
    await expect(mcp.install(io, "kimi-mcp-global", "bad", server)).rejects.toThrow()
    expect(await readFile(globalFile, "utf8")).toBe("{")
  })

  it("delivers agent and instruction files without overwriting unowned files", async () => {
    const f = await fixture(), prompts = createKimiPrompts(() => null, promptTools)
    const io = { files: f.files, workspace: () => f.files.workspace() }
    const prompt = { name: "Review This", description: "Review code", prompt: "Check changes" }
    for (const place of ["kimi", "kimi-global"]) {
      await prompts.install(io, place, prompt, "agent")
      await prompts.install(io, place, prompt, "instructions")
      expect(await prompts.held(io, place, prompt)).toEqual({ agent: true, instructions: true })
      const root = place === "kimi" ? f.folder : f.userHome
      expect(await readFile(path.join(root, ".kimi-code/agents/review-this.md"), "utf8")).toContain("name: review-this")
      expect(await prompts.remove(io, place, prompt, "instructions")).toBe(true)
      expect(await prompts.remove(io, place, prompt, "agent")).toBe(true)
    }
    const agent = path.join(f.folder, ".kimi-code/agents/review-this.md")
    await put(agent, "personal")
    await expect(prompts.install(io, "kimi", prompt, "agent")).rejects.toThrow()
    await expect(prompts.remove(io, "kimi", prompt, "agent")).rejects.toThrow()
    expect(await readFile(agent, "utf8")).toBe("personal")
    await expect(prompts.install(io, "kimi", prompt, "rule")).rejects.toThrow()
    const instruction = path.join(f.folder, ".kimi-code/AGENTS.md")
    const damaged = "Before\n<!-- context-hub:review-this -->\nUser text\n"
    await put(instruction, damaged)
    await expect(prompts.install(io, "kimi", prompt, "instructions")).rejects.toThrow()
    await expect(prompts.remove(io, "kimi", prompt, "instructions")).rejects.toThrow()
    expect(await readFile(instruction, "utf8")).toBe(damaged)
    await expect(prompts.install(io, "kimi", { ...prompt, name: "中文" }, "agent")).rejects.toThrow()
  })

  it("supports KIMI_CODE_HOME and the alternate Kimi manifest", async () => {
    const f = await fixture(), library = path.join(f.root, "library"), custom = path.join(f.root, "custom-kimi")
    await put(path.join(library, "pack/.kimi-plugin/plugin.json"), JSON.stringify({ name: "alternate" }))
    const disk = createDisk({ userHome: f.userHome, env: { KIMI_CODE_HOME: custom }, workspace: async () => f.folder,
      library: { root: library, list: async () => [{ name: "pack" }], has: async () => true } })
    const tools: PluginTools = { disk, has: async () => true, root: async () => library,
      packs: async () => [{ name: "pack", version: "", description: "" }],
      describe: async (_path, name) => ({ name, version: "", description: "" }) }
    await createKimiInstaller().install("pack", "user", tools)
    const doc = JSON.parse(await readFile(path.join(custom, "plugins/installed.json"), "utf8"))
    expect(doc.plugins[0]).toMatchObject({ id: "alternate", root: path.join(custom, "plugins/managed/pack") })
  })

  it("refuses concurrent changes to installation records and managed directories", async () => {
    for (const conflict of ["index", "directory"]) {
      const f = await fixture(), library = path.join(f.root, "library"), pack = path.join(library, "pack")
      await put(path.join(pack, "kimi.plugin.json"), JSON.stringify({ name: "demo" }))
      const disk = createDisk({ userHome: f.userHome, env: {}, workspace: async () => f.folder,
        library: { root: library, list: async () => [{ name: "pack" }], has: async () => true } })
      const commit = disk.commit.bind(disk)
      const index = path.join(f.userHome, ".kimi-code/plugins/installed.json")
      const foreign = path.join(f.userHome, ".kimi-code/plugins/managed/pack/foreign.txt")
      disk.commit = async (...args) => {
        if (conflict === "index") await put(index, '{"version":1,"plugins":[],"external":true}')
        else await put(foreign, "foreign")
        await commit(...args)
      }
      const tools: PluginTools = { disk, has: async () => true, root: async () => library,
      packs: async () => [{ name: "pack", version: "", description: "" }],
        describe: async (_path, name) => ({ name, version: "", description: "" }) }
      await expect(createKimiInstaller().install("pack", "user", tools)).rejects.toThrow(/changed/)
      if (conflict === "index") expect(await readFile(index, "utf8")).toContain('"external":true')
      else expect(await readFile(foreign, "utf8")).toBe("foreign")
    }
  })

  it("rejects a conflicting installation and leaves an invalid record file unchanged", async () => {
    const f = await fixture(), library = path.join(f.root, "library"), pack = path.join(library, "pack")
    await put(path.join(pack, "kimi.plugin.json"), JSON.stringify({ name: "demo" }))
    const disk = createDisk({ userHome: f.userHome, env: {}, workspace: async () => f.folder,
      library: { root: library, list: async () => [{ name: "pack" }], has: async () => true } })
    const tools: PluginTools = { disk, has: async () => true, root: async () => library,
      packs: async () => [{ name: "pack", version: "", description: "" }],
      describe: async (_path, name) => ({ name, version: "", description: "" }) }
    const installer = createKimiInstaller(), index = path.join(f.userHome, ".kimi-code/plugins/installed.json")
    const foreign = JSON.stringify({ version: 1, plugins: [{ id: "demo", root: "/elsewhere", enabled: true, source: "github" }] })
    await put(index, foreign)
    await expect(installer.install("pack", "user", tools)).rejects.toThrow(/another installation source/)
    expect(await readFile(index, "utf8")).toBe(foreign)
    await writeFile(index, '{"version":2,"plugins":[]}')
    await expect(installer.install("pack", "user", tools)).rejects.toThrow(/Unsupported/)
    expect(await readFile(index, "utf8")).toBe('{"version":2,"plugins":[]}')
  })

  it("maps only verified library origins and keeps distinct identities safe in Hub rows", async () => {
    const f = await fixture(), library = path.join(f.root, "library"), pack = path.join(library, "pack")
    const manifest = path.join(pack, "kimi.plugin.json")
    await put(manifest, JSON.stringify({ name: "Other.Name" }))
    const disk = createDisk({ userHome: f.userHome, env: {}, workspace: async () => f.folder,
      library: { root: library, list: async () => [{ name: "pack" }], has: async () => true } })
    const tools: PluginTools = { disk, has: async () => true, root: async () => library,
      packs: async () => [{ name: "pack", version: "", description: "" }],
      describe: async (_path, name) => ({ name, version: "", description: "" }) }
    const installer = createKimiInstaller(), index = path.join(f.userHome, ".kimi-code/plugins/installed.json")
    await installer.install("pack", "user", tools)
    const original = JSON.parse(await readFile(index, "utf8"))
    const owner = original.plugins[0]
    const list = async () => installer.held(tools)
    expect(await list()).toMatchObject([{ name: "pack", id: "other.name" }])
    for (const other of [
      { source: "github" },
      { originalSource: path.join(f.root, "elsewhere", "pack") },
      { root: path.join(f.root, "other-managed", "pack") },
      { id: "different-id" },
    ]) {
      await writeFile(index, JSON.stringify({ version: 1, plugins: [{ ...owner, ...other }] }))
      const [entry] = await list()
      expect(entry?.name).toBe(entry?.id)
    }
    await put(manifest, JSON.stringify({ name: "different-id" }))
    await writeFile(index, JSON.stringify(original))
    expect(await list()).toMatchObject([{ name: "other.name", id: "other.name" }])
    await put(manifest, JSON.stringify({ name: "Other.Name" }))
    const foreign = { id: "pack", root: path.join(f.root, "external"), source: "github", enabled: false }
    await writeFile(index, JSON.stringify({ version: 1, plugins: [owner, foreign] }))
    const entries = await list()
    expect(entries.map(({ name, id }) => ({ name, id }))).toEqual([{ name: "pack", id: "other.name" }, { name: "pack", id: "pack" }])
    const client = { id: installer.id, client: installer.id, label: "Kimi Code", icon: () => null,
      places: installer.places, switches: await installer.switches(tools), packs: entries }
    const scanned = collectScanned([client])
    const records = [{ name: "pack", version: "", description: "", tags: [], source: { kind: "local", path: pack },
      updatedAt: "", assets: [], icon: "", hash: "" }]
    const rows = composeRows(records, scanned, "en", (key) => key)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.held[0]?.places.map((place) => place.id)).toEqual(["other.name", "pack"])
    expect(placesShown(rows[0], [client])).toEqual([])
    await writeFile(index, JSON.stringify(original))
    const ownedEntries = await list()
    const ownedClient = { ...client, packs: ownedEntries, switches: await installer.switches(tools) }
    const ownedRows = composeRows(records, collectScanned([ownedClient]), "en", (key) => key)
    expect(ownedRows).toHaveLength(1)
    expect(ownedRows[0]?.held[0]?.places[0]?.id).toBe("other.name")
    expect(placesShown(ownedRows[0], [ownedClient])).toHaveLength(1)
  })

  it("installs and switches real files, then leaves the managed copy on removal", async () => {
    const f = await fixture(), library = path.join(f.root, "library"), pack = path.join(library, "pack")
    await put(path.join(pack, "kimi.plugin.json"), JSON.stringify({ name: "Other.Name", version: "1" }))
    const disk = createDisk({ userHome: f.userHome, env: {}, workspace: async () => f.folder,
      library: { root: library, list: async () => [{ name: "pack" }], has: async () => true } })
    const tools: PluginTools = { disk, has: async () => true, root: async () => library,
      packs: async () => [{ name: "pack", version: "", description: "" }],
      describe: async (_path, name) => ({ name, version: "1", description: "" }) }
    const installer = createKimiInstaller()
    await installer.install("pack", "user", tools)
    const index = path.join(f.userHome, ".kimi-code/plugins/installed.json")
    let doc = JSON.parse(await readFile(index, "utf8"))
    expect(doc.plugins[0]).toMatchObject({ id: "other.name", enabled: true, source: "local-path" })
    expect(await installer.held(tools)).toMatchObject([{ name: "pack", id: "other.name" }])
    expect(doc.plugins[0].root).toBe(path.join(f.userHome, ".kimi-code/plugins/managed/pack"))
    doc.extra = "keep"; doc.plugins[0].custom = "keep"
    await writeFile(index, JSON.stringify(doc))
    await installer.setEnabled("other.name", "user", false, tools)
    await installer.install("pack", "user", tools)
    doc = JSON.parse(await readFile(index, "utf8"))
    expect(doc).toMatchObject({ extra: "keep", plugins: [{ id: "other.name", enabled: false, custom: "keep" }] })
    const modified = path.join(f.userHome, ".kimi-code/plugins/managed/pack/user.txt")
    await put(modified, "keep")
    await expect(installer.install("pack", "user", tools)).rejects.toThrow(/differs from the library/)
    expect(await readFile(modified, "utf8")).toBe("keep")
    await installer.remove("other.name", "user", tools)
    expect(await readFile(path.join(f.userHome, ".kimi-code/plugins/managed/pack/kimi.plugin.json"), "utf8")).toContain("Other.Name")
    await expect(installer.install("pack", "user", tools)).rejects.toThrow(/already exists/)
    expect(JSON.parse(await readFile(index, "utf8")).plugins).toEqual([])
  })
})
