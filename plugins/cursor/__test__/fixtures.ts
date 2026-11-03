import { promises as fs } from "node:fs"
import path from "node:path"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"
import type { McpTools, PromptTools, McpIo, PluginDisk, PluginTools, PromptIo, PromptFiles } from "../src/contracts.ts"

const hubSource = process.env.CURSOR_TEST_HUB_SOURCE
export const hostAvailable = !!hubSource
async function fromHost<T>(relative: string): Promise<T> {
  if (!hubSource) throw new Error("CURSOR_TEST_HUB_SOURCE is required for host integration tests")
  return import(pathToFileURL(path.join(hubSource, relative)).href) as Promise<T>
}
const mcpModule = hubSource ? await fromHost<{ mcpTools: McpTools }>("packages/resources/mcp/src/toolkit.ts") : null
const promptModule = hubSource ? await fromHost<{ promptTools: PromptTools }>("packages/resources/prompts/src/toolkit.ts") : null
export const mcpTools = mcpModule?.mcpTools as McpTools
export const promptTools = promptModule?.promptTools as PromptTools

interface TestLibrary {
  root: string
  add(name: string, stage: string, source: { kind: "local"; path: string }, hash: string, manifests: string[]): Promise<unknown>
}

export async function fixture() {
  const root = await fs.mkdtemp(path.join(tmpdir(), "cursor-extension-"))
  const workspace = path.join(root, "workspace")
  const userHome = path.join(root, "user")
  const home = path.join(root, "hub")
  const [{ createFsPlaceFiles }, { createFsPluginLibrary }, { createInstallerFiles }] = await Promise.all([
    fromHost<{ createFsPlaceFiles(options: { home: string; userHome: string; folder: string }): PromptFiles }>("packages/core/src/host/place-files.ts"),
    fromHost<{ createFsPluginLibrary(home: string): TestLibrary }>("packages/resources/plugins/src/host/library.ts"),
    fromHost<{ createInstallerFiles(options: { library: TestLibrary; workspace(): Promise<string>; userHome: string; env: Record<string, string> }): PluginDisk }>("packages/resources/plugins/src/host/installer-files.ts"),
  ])
  const library = createFsPluginLibrary(home)
  await fs.mkdir(workspace, { recursive: true })
  await fs.mkdir(userHome, { recursive: true })
  const files = createFsPlaceFiles({ home, userHome, folder: workspace })
  const io: PromptIo = { files, workspace: async () => workspace }
  const mcpIo: McpIo = { files, log() {} }
  const disk = createInstallerFiles({ library, workspace: async () => workspace, userHome, env: {} }) as unknown as PluginDisk
  const tools: PluginTools = {
    disk, files, root: async () => library.root, packs: async () => [],
    syncMarketplace: async () => { throw new Error("marketplace not used") },
    run: async () => { throw new Error("CLI not used") },
    has: async () => { throw new Error("CLI not used") },
    describe: async (_, name) => ({ name, version: "", description: "" }),
  }
  async function pack(name = "demo", manifest: unknown = { name, version: "1.0.0" }) {
    const stage = path.join(root, `stage-${name}`)
    await fs.mkdir(path.join(stage, ".cursor-plugin"), { recursive: true })
    await fs.mkdir(path.join(stage, "skills", "hello"), { recursive: true })
    await fs.writeFile(path.join(stage, ".cursor-plugin", "plugin.json"), JSON.stringify(manifest))
    await fs.writeFile(path.join(stage, "skills", "hello", "SKILL.md"), "fixture")
    await library.add(name, stage, { kind: "local", path: root }, "fixture", [".cursor-plugin/plugin.json"])
  }
  return { root, home, userHome, workspace, io, mcpIo, tools, library, pack, cleanup: () => fs.rm(root, { recursive: true, force: true }) }
}
