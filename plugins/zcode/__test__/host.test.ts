import { existsSync } from "node:fs"
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import type { McpIo, McpTools, PluginDisk, PluginTools, PromptFiles, PromptTools } from "../src/contracts.ts"
import { createZCodeInstaller } from "../src/installer.ts"
import { createZCodeMcp } from "../src/provider.ts"
import { createZCodePrompts } from "../src/prompts.ts"
import { ZCODE_PLUGIN_ROOTS } from "../src/locations.ts"

// 仅在显式 checkout 下运行；所有资产路径均由测试创建的临时根注入。
const checkout = process.env.CONTEXT_HUB_CHECKOUT
const enabled = typeof checkout === "string" && checkout !== ""
const modules = {
  mcp: "packages/resources/mcp/src/toolkit.ts",
  prompts: "packages/resources/prompts/src/toolkit.ts",
  files: "packages/core/src/host/place-files.ts",
  installer: "packages/resources/plugins/src/host/installer-files.ts",
  library: "packages/resources/plugins/src/host/library.ts",
  marketplace: "packages/resources/plugins/src/host/marketplace.ts",
  atomic: "packages/core/src/host/atomic.ts",
} as const
if (enabled && (!path.isAbsolute(checkout) || Object.values(modules).some((file) => !existsSync(path.join(checkout, file))))) {
  throw new Error("CONTEXT_HUB_CHECKOUT 必须为包含所有宿主源码的绝对路径")
}
interface Library {
  root: string
  list(): Promise<{ name: string; version: string; description: string }[]>
  add(name: string, staged: string, source: unknown, hash: string, manifests: readonly string[]): Promise<unknown>
}
interface Host {
  mcp: McpTools
  prompts: PromptTools
  files(options: { home: string; folder: string; userHome: string }): PromptFiles
  library(home: string): Library
  installer(options: { library: Library; workspace(): Promise<string | null>; userHome: string; env: Record<string, string>; write?: (file: string, text: string) => Promise<void> }): PluginDisk
  marketplace(root: string, indexes: readonly { path: string; document: unknown }[]): Promise<void>
  write(file: string, text: string): Promise<void>
}
let host: Host
beforeAll(async () => {
  if (!enabled) return
  const values = await Promise.all(Object.values(modules).map((file) => import(pathToFileURL(path.join(checkout!, file)).href)))
  host = { mcp: values[0]!.mcpTools, prompts: values[1]!.promptTools, files: values[2]!.createFsPlaceFiles, installer: values[3]!.createInstallerFiles, library: values[4]!.createFsPluginLibrary, marketplace: values[5]!.writeMarketplaceIndexes, write: values[6]!.writeFileAtomic }
})
const temporary: string[] = []
afterEach(async () => { await Promise.all(temporary.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })
async function put(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, text)
}
async function setup(write?: Host["write"]) {
  const root = await mkdtemp(path.join(tmpdir(), "zcode-host-中文 空格-"))
  temporary.push(root)
  const home = path.join(root, "hub")
  const folder = path.join(root, "workspace")
  const userHome = path.join(root, "user")
  await Promise.all([home, folder, userHome].map((dir) => mkdir(dir, { recursive: true })))
  const files = host.files({ home, folder, userHome })
  const library = host.library(home)
  const staged = path.join(root, "fixture")
  await put(path.join(staged, ".zcode-plugin/plugin.json"), '{"name":"demo","version":"1.0.0","description":"native only","mcpServers":{"inline":{"type":"stdio","command":"node","args":["server.js"]}}}')
  await put(path.join(staged, "commands/demo.md"), "---\nname: demo\ndescription: inert fixture\n---\nNo execution.\n")
  await put(path.join(staged, "skills/demo/SKILL.md"), "---\nname: demo\ndescription: inert fixture\n---\n")
  await put(path.join(staged, "agents/demo.md"), "---\nname: demo\ndescription: inert fixture\n---\n")
  await put(path.join(staged, "hooks/hooks.json"), '{"hooks":{}}')
  await put(path.join(staged, ".hidden"), "preserved")
  await put(path.join(staged, "script.sh"), "#!/bin/sh\nexit 0\n")
  await chmod(path.join(staged, "script.sh"), 0o755)
  await library.add("demo", staged, { kind: "local", path: root }, "fixture", [".zcode-plugin/plugin.json"])
  let workspace: string | null = folder
  const disk = host.installer({ library, workspace: async () => workspace, userHome, env: {}, write })
  let cli = 0
  const tools: PluginTools = {
    disk, root: async () => library.root, packs: () => library.list(),
    syncMarketplace: (indexes) => host.marketplace(library.root, indexes),
    async run() { cli++; throw new Error("禁止 CLI") },
    async has() { cli++; throw new Error("禁止 CLI") },
  }
  return { root, home, folder, userHome, files, library, disk, tools, cli: () => cli, workspace: (next: string | null) => { workspace = next } }
}
async function tree(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  async function visit(dir: string, prefix: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const name = prefix === "" ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) { result[`${name}/`] = ""; await visit(path.join(dir, entry.name), name) }
      else result[name] = (await readFile(path.join(dir, entry.name))).toString("base64")
    }
  }
  await visit(root, "")
  return result
}
const real = enabled ? describe : describe.skip
real("真实宿主端口的 ZCode 隔离回归", () => {
  it("原生-only 收录与缓存逐字节一致，user 生命周期保留 data/options", async () => {
    const { userHome, library, disk, tools, cli } = await setup()
    const provider = createZCodeInstaller(host.mcp)
    const installed = await provider.install("demo", "user", tools)
    expect(installed.location).toBe(path.join(userHome, ".zcode/cli/plugins/cache/context-hub/demo/1.0.0"))
    expect(await tree(installed.location!)).toEqual(await tree(path.join(library.root, "demo")))
    expect((await lstat(path.join(installed.location!, "script.sh"))).mode & 0o111).toBe((await lstat(path.join(library.root, "demo/script.sh"))).mode & 0o111)
    expect((await provider.held(tools))[0]).toMatchObject({ id: "demo@context-hub", enabled: true })
    await provider.setEnabled("demo@context-hub", "user", false, tools)
    await provider.install("demo", "user", tools)
    expect((await provider.held(tools))[0]!.enabled).toBe(false)
    const data = path.join(userHome, ".zcode/cli/plugins/data/demo@context-hub/kept.txt")
    await put(data, "keep")
    const config = path.join(userHome, ".zcode/cli/config.json")
    await writeFile(config, host.mcp.editJson(await readFile(config, "utf8"), ["plugins", "options", "demo@context-hub"], { value: "keep" }))
    await provider.remove("demo@context-hub", "user", tools)
    expect(existsSync(installed.location!)).toBe(false)
    expect(await readFile(data, "utf8")).toBe("keep")
    expect(JSON.parse(await readFile(config, "utf8")).plugins.options).toEqual({ "demo@context-hub": { value: "keep" } })
    expect(cli()).toBe(0)
    const roots = await disk.roots(ZCODE_PLUGIN_ROOTS)
    expect(roots.plugins).toBe(path.join(userHome, ".zcode/cli/plugins"))
    await expect(disk.run(ZCODE_PLUGIN_ROOTS, (locked) => disk.commit(locked, [{ ref: { root: "plugins", path: "data/unsafe" }, before: null, after: "bad" }]))).rejects.toThrow(/allowlist/)
  })

  it("MCP 和 plugins 交替编辑保留邻接字节，locate 指向真实 server 行", async () => {
    const { files, tools, userHome } = await setup()
    const config = path.join(userHome, ".zcode/cli/config.json")
    const hooks = '"hooks": { "enabled": true, "future": [1, 2] }'
    const secret = '"provider": { "layout" : "keep-spacing" }'
    await put(config, `{\n  ${hooks},\n  ${secret}\n}\n`)
    const io: McpIo = { files, log() {} }
    const mcp = createZCodeMcp(host.mcp)
    await mcp.install(io, "zcode-global", "demo", { transport: "stdio", command: "node", args: ["fixture.js"], env: {} })
    await createZCodeInstaller(host.mcp).install("demo", "user", tools)
    await mcp.setEnabled(io, "zcode-global", "global", "demo", false)
    const text = await readFile(config, "utf8")
    expect(text).toContain(hooks)
    expect(text).toContain(secret)
    expect(JSON.parse(text).plugins.enabledPlugins["demo@context-hub"]).toBe(true)
    const [first, last] = (await mcp.locate(io, "zcode-global", "demo"))!
    expect(text.split("\n").slice(first - 1, last).join("\n")).toContain('"command": "node"')
    await mcp.uninstall(io, "zcode-global", "demo")
    expect(JSON.parse(await readFile(config, "utf8")).plugins.enabledPlugins["demo@context-hub"]).toBe(true)
  })

  it("真实 Markdown 工具保留 instruction 正文，Agent name/description 规范", async () => {
    const { userHome, files } = await setup()
    const provider = createZCodePrompts(() => null, host.prompts)
    const io = { files, workspace: () => files.workspace() }
    const prompt = { name: "Review", description: '检查: "quoted"\nsecond', prompt: "Review changes." }
    const instruction = path.join(userHome, ".zcode/AGENTS.md")
    await put(instruction, "# Existing\r\n\r\nKeep this.\r\n")
    await provider.install(io, "zcode-global", prompt, "instructions")
    await provider.install(io, "zcode-global", prompt, "instructions")
    await provider.install(io, "zcode-global", prompt, "agent")
    expect(await provider.held(io, "zcode-global", prompt)).toEqual({ agent: true, instructions: true })
    const agent = await readFile(path.join(userHome, ".zcode/agents/review.md"), "utf8")
    expect(agent).toContain("name: review")
    expect(agent).toContain('description: "检查: \\"quoted\\" second"')
    await provider.remove(io, "zcode-global", prompt, "instructions")
    expect(await readFile(instruction, "utf8")).toBe("# Existing\r\n\r\nKeep this.\r\n")
    for (const name of ["x".repeat(65), "中文", "../escape"]) {
      await expect(provider.install(io, "zcode-global", { ...prompt, name }, "commands")).rejects.toThrow()
    }
  })

  it.each(["installed_plugins.json", "known_marketplaces.json"])("%s 未知字段保留与对应原子写失败回滚", async (target) => {
    const state = await setup()
    const provider = createZCodeInstaller(host.mcp)
    await provider.install("demo", "user", state.tools)
    const directory = path.join(state.userHome, ".zcode/cli/plugins")
    const index = path.join(directory, "installed_plugins.json")
    const known = path.join(directory, "known_marketplaces.json")
    for (const file of [index, known]) {
      const doc = JSON.parse(await readFile(file, "utf8"))
      doc.unknown = { keep: "top" }
      const row = doc.plugins?.[0] ?? doc.marketplaces[0]
      row.unknown = { keep: "record" }
      row.cacheTransactionId = "opaque"
      await writeFile(file, JSON.stringify(doc, null, 4))
    }
    await provider.install("demo", "user", state.tools)
    for (const file of [index, known]) {
      const doc = JSON.parse(await readFile(file, "utf8"))
      expect(doc.unknown).toEqual({ keep: "top" })
      expect((doc.plugins?.[0] ?? doc.marketplaces[0]).unknown).toEqual({ keep: "record" })
    }
    const before = await tree(path.join(state.userHome, ".zcode"))
    let injected = false
    const failedDisk = host.installer({ library: state.library, workspace: async () => state.folder, userHome: state.userHome, env: {}, write: async (file, text) => {
      if (!injected && file === path.join(directory, target)) { injected = true; throw new Error(`injected ${target}`) }
      await host.write(file, text)
    } })
    await expect(provider.install("demo", "user", { ...state.tools, disk: failedDisk })).rejects.toThrow(/injected/)
    expect(injected).toBe(true)
    expect(await tree(path.join(state.userHome, ".zcode"))).toEqual(before)
  })

  it("复制前源文件变化和卸载前缓存变化均零写拒绝", async () => {
    const state = await setup()
    const provider = createZCodeInstaller(host.mcp)
    const source = path.join(state.library.root, "demo/.hidden")
    const originalCommit = state.disk.commit.bind(state.disk)
    state.disk.commit = async (roots, changes, copy, remove) => {
      if (copy !== undefined) await writeFile(source, "changed-before-copy")
      return originalCommit(roots, changes, copy, remove)
    }
    await expect(provider.install("demo", "user", state.tools)).rejects.toThrow(/pack changed/)
    expect(existsSync(path.join(state.userHome, ".zcode/cli/plugins/installed_plugins.json"))).toBe(false)
    expect(existsSync(path.join(state.userHome, ".zcode/cli/plugins/cache/context-hub/demo/1.0.0"))).toBe(false)
    state.disk.commit = originalCommit
    await writeFile(source, "preserved")
    const installed = await provider.install("demo", "user", state.tools)
    await writeFile(path.join(installed.location!, ".hidden"), "user edit")
    const before = await tree(path.join(state.userHome, ".zcode"))
    await expect(provider.remove("demo@context-hub", "user", state.tools)).rejects.toThrow(/changed/)
    expect(await tree(path.join(state.userHome, ".zcode"))).toEqual(before)
  })

  it("卸载事务写失败时恢复整个缓存和 config/registry", async () => {
    const state = await setup()
    const provider = createZCodeInstaller(host.mcp)
    const installed = await provider.install("demo", "user", state.tools)
    const before = await tree(path.join(state.userHome, ".zcode"))
    let failed = false
    const disk = host.installer({ library: state.library, workspace: async () => state.folder, userHome: state.userHome, env: {}, write: async (file, text) => {
      if (!failed && file === path.join(state.userHome, ".zcode/cli/config.json")) { failed = true; throw new Error("injected remove") }
      await host.write(file, text)
    } })
    await expect(provider.remove("demo@context-hub", "user", { ...state.tools, disk })).rejects.toThrow(/injected remove/)
    expect(failed).toBe(true)
    expect(existsSync(installed.location!)).toBe(true)
    expect(await tree(path.join(state.userHome, ".zcode"))).toEqual(before)
  })

  it("同版本不同字节、配置变化、workspace 变化与中间 junction 均拒绝", async () => {
    const state = await setup()
    const provider = createZCodeInstaller(host.mcp)
    const installed = await provider.install("demo", "user", state.tools)
    await writeFile(path.join(state.library.root, "demo/.hidden"), "changed")
    await expect(provider.install("demo", "user", state.tools)).rejects.toThrow(/同版本源内容已变化/)
    expect(await readFile(path.join(installed.location!, ".hidden"), "utf8")).toBe("preserved")
    await state.disk.run(ZCODE_PLUGIN_ROOTS, async (roots) => {
      const before = await state.disk.read(roots, { root: "config", path: "cli/config.json" })
      await writeFile(path.join(state.userHome, ".zcode/cli/config.json"), "{}")
      await expect(state.disk.commit(roots, [{ ref: { root: "config", path: "cli/config.json" }, before, after: "{}" }])).rejects.toThrow(/changed/)
    })
    await state.disk.run(ZCODE_PLUGIN_ROOTS, async (roots) => {
      state.workspace(null)
      await expect(state.disk.commit(roots, [])).rejects.toThrow(/changed/)
    })
    const second = await setup()
    await mkdir(path.join(second.userHome, ".zcode"), { recursive: true })
    await symlink(second.root, path.join(second.userHome, ".zcode/cli"), "junction")
    await expect(second.disk.roots(ZCODE_PLUGIN_ROOTS)).rejects.toThrow(/symbolic link/)
  })
})
