import { afterEach, beforeEach, expect, it } from "vitest"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { existsSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"

const host = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../dsh-context-hub")
const withHost = existsSync(path.join(host, "packages/resources/mcp/src/toolkit.ts")) ? it : it.skip
async function hostModule(relative: string) {
  return import(/* @vite-ignore */ pathToFileURL(path.join(host, relative)).href)
}
import { createAntigravityInstaller } from "../src/installer.ts"
import { createAntigravityMcp } from "../src/provider.ts"
import { createAntigravityPrompts } from "../src/prompts.ts"
import type { McpTools, PluginTools, PromptIo, PromptRef } from "../src/contracts.ts"

let root: string
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "antigravity-hub-")) })
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }) })

it("MCP 拒绝旧字段且不写文件", async () => {
  let writes = 0
  const tools = { parseJsonc: JSON.parse, readDeclaration: () => null, McpError: Error } as unknown as McpTools
  const provider = createAntigravityMcp(tools)
  const io = { files: { read: async () => '{"mcpServers":{"demo":{"url":"https://old"}}}', write: async () => { writes++ } }, log: () => {} }
  await expect(provider.uninstall(io, "antigravity-global", "demo")).rejects.toThrow()
  expect(writes).toBe(0)
})

withHost("MCP 使用原生远程字段并保留其他字段，拒绝旧字段", async () => {
  const { mcpTools } = await hostModule("packages/resources/mcp/src/toolkit.ts")
  const provider = createAntigravityMcp(mcpTools as unknown as McpTools)
  let text: string | null = '{"unrelated":true}'
  const io = { files: { read: async () => text, write: async (_ref: unknown, next: string) => { text = next } }, log: () => {} }
  await provider.install(io, "antigravity-global", "new", { transport: "stdio", command: "node", args: [], env: {} })
  expect(JSON.parse(text!).mcpServers.new.command).toBe("node")
  text = '{\n  // keep\n  "mcpServers": {"demo": {"command":"node","disabled":true,"cwd":"/tmp"}}\n}'
  await provider.install(io, "antigravity-global", "demo", { transport: "http", url: "https://example.test/mcp", headers: {} })
  expect(text).toContain('// keep')
  expect(JSON.parse(text!.replace('// keep', '')).mcpServers.demo).toEqual({ disabled: true, cwd: "/tmp", serverUrl: "https://example.test/mcp" })
  expect((await provider.read(io, "antigravity-global"))[0]?.enabled).toBe(false)
  await provider.setEnabled!(io, "antigravity-global", "global", "demo", true)
  expect((await provider.read(io, "antigravity-global"))[0]?.enabled).toBe(true)
  text = '{"mcpServers":{"demo":{"url":"https://old"}}}'
  const before = text
  await expect(provider.uninstall(io, "antigravity-global", "demo")).rejects.toThrow()
  expect(text).toBe(before)
})

withHost("规则只接管精确标记文件并检查 UTF-8 大小", async () => {
  const { promptTools } = await hostModule("packages/resources/prompts/src/toolkit.ts")
  const provider = createAntigravityPrompts(() => null, promptTools)
  const map = new Map<string, string>()
  const files = { read: async (ref: PromptRef) => map.get(ref.file) ?? null, write: async (ref: PromptRef, text: string) => { map.set(ref.file, text) }, remove: async (ref: PromptRef) => { map.delete(ref.file) }, workspace: async () => root }
  const io: PromptIo = { files, workspace: files.workspace }
  const prompt = { name: "review", description: 'Review: "code"', prompt: "Review changes" }
  await provider.install(io, "antigravity", prompt, "rule")
  const file = ".agents/rules/context-hub-review.md"
  expect(map.get(file)).toContain('trigger: model_decision\ndescription: "Review: \\"code\\""')
  expect(await provider.held(io, "antigravity", prompt)).toEqual({ rule: true })
  map.set(file, '---\ntrigger: model_decision\n---\nuser text\n<!-- context-hub:review -->')
  await expect(provider.remove(io, "antigravity", prompt, "rule")).rejects.toThrow()
  map.delete(file)
  await expect(provider.install(io, "antigravity", { ...prompt, prompt: "汉".repeat(9000) }, "rule")).rejects.toThrow()
  expect(map.has(file)).toBe(false)
})

withHost("真实宿主文件端口只向隔离根复制和记录，拒绝非原生包", async () => {
  const { mcpTools } = await hostModule("packages/resources/mcp/src/toolkit.ts")
  const { createInstallerFiles } = await hostModule("packages/resources/plugins/src/host/installer-files.ts")
  const { createFsPluginLibrary } = await hostModule("packages/resources/plugins/src/host/library.ts")
  const hub = path.join(root, "hub"), userHome = path.join(root, "user"), folder = path.join(root, "workspace"), staged = path.join(root, "staged")
  await fs.mkdir(staged, { recursive: true })
  await fs.mkdir(folder, { recursive: true })
  await fs.writeFile(path.join(staged, "plugin.json"), JSON.stringify({ name: "demo", version: "1.0.0" }))
  await fs.writeFile(path.join(staged, "file.txt"), "payload")
  const library = createFsPluginLibrary(hub)
  await library.add("demo", staged, { kind: "local", path: staged }, "fixture")
  const disk = createInstallerFiles({ library, workspace: async () => folder, userHome, env: {} })
  const forbidden = async () => { throw new Error("unexpected CLI call") }
  const tools = { disk, root: async () => library.root, describe: async (_path: string, name: string) => ({ name, version: "1.0.0", description: "" }), has: forbidden, run: forbidden, syncMarketplace: forbidden, packs: forbidden } as unknown as PluginTools
  const installer = createAntigravityInstaller(mcpTools)
  await installer.install("demo", "user", tools)
  await installer.install("demo", "user", tools)
  const config = path.join(userHome, ".gemini/config/plugins.json")
  expect(JSON.parse(await fs.readFile(config, "utf8")).entries).toHaveLength(1)
  const ownEntry = JSON.parse(await fs.readFile(config, "utf8")).entries[0]
  await fs.writeFile(config, JSON.stringify({ extra: "keep", entries: [{ ...ownEntry, exclude: ["one"] }] }))
  await installer.install("demo", "user", tools)
  expect(JSON.parse(await fs.readFile(config, "utf8"))).toMatchObject({ extra: "keep", entries: [{ exclude: ["one"] }] })
  const held = (await installer.held(tools))[0]
  expect(held?.id).toBe("demo@context-hub")
  expect(held?.enabled).toBeUndefined()
  const cached = path.join(userHome, ".gemini/context-hub/cache/context-hub/demo/1.0.0/plugin.json")
  expect(await fs.readFile(cached, "utf8")).toBe(JSON.stringify({ name: "demo", version: "1.0.0" }))
  await fs.writeFile(path.join(library.root, "demo", "plugin.json"), '{"name":"demo","version":"../escape"}')
  await expect(installer.install("demo", "user", tools)).rejects.toThrow(/version/)
  await fs.writeFile(path.join(library.root, "demo", "plugin.json"), '{"name":"demo","commands":"./commands"}')
  await expect(installer.install("demo", "user", tools)).rejects.toThrow(/manifest/)
  await fs.writeFile(path.join(library.root, "demo", "plugin.json"), JSON.stringify({ name: "demo", version: "1.0.0" }))
  expect(JSON.parse(await fs.readFile(config, "utf8")).entries).toHaveLength(1)
  const cacheFile = path.join(userHome, ".gemini/context-hub/cache/context-hub/demo/1.0.0/file.txt")
  await fs.writeFile(cacheFile, "user change")
  await expect(installer.install("demo", "user", tools)).rejects.toThrow(/different files/)
  expect(await fs.readFile(cacheFile, "utf8")).toBe("user change")
  const report = await installer.remove("demo@context-hub", "user", tools)
  expect(report.message).toContain("cache retained")
  expect(await fs.readFile(cacheFile, "utf8")).toBe("user change")
  expect(JSON.parse(await fs.readFile(config, "utf8")).entries).toEqual([])
})
