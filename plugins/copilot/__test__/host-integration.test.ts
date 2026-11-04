import { afterEach, describe, expect, it } from "vitest"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { createCopilotInstaller } from "../src/installer.ts"
import { createCopilotMcp } from "../src/provider.ts"
import type { McpTools } from "../src/contracts.ts"
import type { PluginTools } from "../src/contracts.ts"

// 宿主源码只由开发工作树提供，不属于发布后的扩展。
const host = process.env.COPILOT_HOST_TEST ?? ""
const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }) })

describe.skipIf(!process.env.COPILOT_HOST_TEST)("host disk integration", () => {
  it("commits declarations and respects independent temporary roots", async () => {
    const { createFsPluginLibrary } = await import(`${host}/plugins/src/host/library.ts`)
    const { createInstallerFiles } = await import(`${host}/plugins/src/host/installer-files.ts`)
    const { writeMarketplaceIndexes } = await import(`${host}/plugins/src/host/marketplace.ts`)
    const { readJsonObject, editJson, jsonValueLines } = await import(`${host}/mcp/src/jsonc.ts`)
    const { readDeclaration, writeDeclaration } = await import(`${host}/mcp/src/declaration.ts`)
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-hub-test-")); roots.push(root)
    const workspace = path.join(root, "workspace"), config = path.join(root, "config"), user = path.join(root, "user")
    const library = createFsPluginLibrary(path.join(root, "hub"))
    await fs.mkdir(workspace, { recursive: true })
    await fs.mkdir(path.join(library.root, "demo"), { recursive: true })
    await fs.writeFile(path.join(library.root, "demo", "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.1.0/plugin.schema.json", name: "demo" }))
    const disk = createInstallerFiles({ library, workspace: async () => workspace, userHome: user, env: { COPILOT_HOME: config } })
    const tools = { disk, root: async () => library.root, files: null, packs: async () => [{ name: "demo", description: "", version: "" }], syncMarketplace: (indexes: unknown) => writeMarketplaceIndexes(library.root, indexes), run: async () => { throw new Error("CLI called") }, has: async () => { throw new Error("CLI called") }, describe: async (_: string, name: string) => ({ name, version: "", description: "" }) } as PluginTools
    const installer = createCopilotInstaller({ readJsonObject, editJson })
    await fs.mkdir(config, { recursive: true })
    await fs.writeFile(path.join(config, "settings.json"), '{\n  // preserve settings comment\n  "theme": "dark"\n}')
    await installer.install("demo", "user", tools)
    await installer.install("demo", "project", tools)
    expect(await fs.readFile(path.join(config, "settings.json"), "utf8")).toContain("// preserve settings comment")
    expect(readJsonObject(await fs.readFile(path.join(config, "settings.json"), "utf8")).extraKnownMarketplaces["context-hub"].source.path).toBe(library.root)
    expect(JSON.parse(await fs.readFile(path.join(workspace, ".github/copilot/settings.json"), "utf8")).enabledPlugins["demo@context-hub"]).toBe(true)
    expect((await installer.held(tools)).find((p) => p.scope === "project")).toMatchObject({ id: "demo@context-hub", origin: "declaration", enabled: true })
    await installer.remove("demo@context-hub", "project", tools)
    await installer.remove("demo@context-hub", "user", tools)
    expect((await installer.held(tools))).toEqual([])
    expect(await fs.readFile(path.join(library.root, "demo", "plugin.json"), "utf8")).toContain("1.1.0")
    const mcpFile = path.join(workspace, ".vscode", "mcp.json")
    await fs.mkdir(path.dirname(mcpFile), { recursive: true })
    await fs.writeFile(mcpFile, '{\n  // preserve comment\n  "inputs": [],\n  "servers": { "demo": { "type": "stdio", "command": "old", "cwd": "project" } }\n}')
    const provider = createCopilotMcp({ readJsonObject, editJson, jsonValueLines, readDeclaration, writeDeclaration, McpError: Error } as unknown as McpTools)
    const io = { files: { read: async () => fs.readFile(mcpFile, "utf8"), write: async (_: unknown, text: string) => { await fs.writeFile(mcpFile, text) } }, log: () => {} }
    await provider.install(io, "copilot-mcp-vscode", "demo", { transport: "stdio", command: "node", args: [], env: {} })
    const updated = await fs.readFile(mcpFile, "utf8")
    expect(updated).toContain("// preserve comment")
    expect(readJsonObject(updated)).toMatchObject({ inputs: [], servers: { demo: { command: "node", cwd: "project" } } })
  })
})
