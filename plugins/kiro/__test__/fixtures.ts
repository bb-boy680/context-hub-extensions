import { promises as fs } from "node:fs"
import path from "node:path"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"
import type { McpIo, McpTools, PluginDisk, PluginTools, PromptFiles, PromptIo, PromptTools } from "../src/contracts.ts"

const hubSource = process.env.KIRO_TEST_HUB_SOURCE
export const hostAvailable = !!hubSource
async function fromHost<T>(relative: string): Promise<T> {
  if (!hubSource) throw new Error("KIRO_TEST_HUB_SOURCE is required for host integration tests")
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
  const root = await fs.mkdtemp(path.join(tmpdir(), "kiro-extension-"))
  const workspace = path.join(root, "workspace"), userHome = path.join(root, "user"), home = path.join(root, "hub")
  const [{ createFsPlaceFiles }, { createFsPluginLibrary }, { createInstallerFiles }] = await Promise.all([
    fromHost<{ createFsPlaceFiles(options: { home: string; userHome: string; folder: string }): PromptFiles }>("packages/core/src/host/place-files.ts"),
    fromHost<{ createFsPluginLibrary(home: string): TestLibrary }>("packages/resources/plugins/src/host/library.ts"),
    fromHost<{ createInstallerFiles(options: { library: TestLibrary; workspace(): Promise<string>; userHome: string; env: Record<string, string>; write?: (file: string, data: string) => Promise<void> }): PluginDisk }>("packages/resources/plugins/src/host/installer-files.ts"),
  ])
  const library = createFsPluginLibrary(home)
  await fs.mkdir(workspace, { recursive: true })
  await fs.mkdir(userHome, { recursive: true })
  const files = createFsPlaceFiles({ home, userHome, folder: workspace })
  const io: PromptIo = { files, workspace: async () => workspace }
  const mcpIo: McpIo = { files, log() {} }
  const disk = createInstallerFiles({ library, workspace: async () => workspace, userHome, env: {} })
  const tools: PluginTools = {
    disk, files, root: async () => library.root, packs: async () => [],
    syncMarketplace: async () => { throw new Error("marketplace not used") },
    run: async () => { throw new Error("CLI not used") },
    has: async () => { throw new Error("CLI not used") },
    describe: async (_, name) => ({ name, version: "", description: "" }),
  }
  async function pack(name = "demo", manifest: unknown = { $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name, version: "1.0.0", description: "Demo", author: { name: "Example" }, keywords: ["demo"] }) {
    const stage = path.join(root, `stage-${name}`)
    await fs.mkdir(path.join(stage, "skills", "hello"), { recursive: true })
    await fs.writeFile(path.join(stage, "plugin.json"), JSON.stringify(manifest))
    await fs.writeFile(path.join(stage, "skills", "hello", "SKILL.md"), "fixture")
    await library.add(name, stage, { kind: "local", path: root }, "fixture", ["plugin.json"])
  }
  function failingDisk() {
    let writes = 0
    return createInstallerFiles({ library, workspace: async () => workspace, userHome, env: {}, write: async (file, text) => {
      if (++writes === 2) throw new Error("injected write failure")
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, text)
    } })
  }
  return { root, home, userHome, workspace, io, mcpIo, tools, library, pack, failingDisk, cleanup: () => fs.rm(root, { recursive: true, force: true }) }
}
