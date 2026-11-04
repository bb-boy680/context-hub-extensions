import { existsSync } from "node:fs"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import type { McpIo, McpTools, PromptIo, PromptTools, SkillPlace, SkillProvider } from "../src/contracts.ts"
import { createQoderPrompts } from "../src/prompts.ts"
import { apply } from "../src/index.tsx"
import { createQoderMcp } from "../src/provider.ts"

const checkout = process.env.CONTEXT_HUB_CHECKOUT
const enabled = typeof checkout === "string" && checkout.trim() !== ""
const hostFiles = [
  "packages/resources/mcp/src/toolkit.ts", "packages/core/src/host/place-files.ts", "packages/resources/prompts/src/toolkit.ts",
  "packages/resources/plugins/src/host/describe.ts", "packages/resources/plugins/src/provider.ts", "packages/extensions/src/cordis.ts",
  "packages/resources/skills/src/provider.ts", "packages/resources/plugins/src/host/library.ts", "packages/resources/plugins/src/host/collect.ts",
]
if (enabled) {
  if (!path.isAbsolute(checkout)) throw new Error("CONTEXT_HUB_CHECKOUT must be absolute")
  for (const file of hostFiles) if (!existsSync(path.join(checkout, file))) throw new Error(`Missing host file: ${file}`)
}
let hostTools: McpTools & { parseJsonc(text: string): unknown }
let promptTools: PromptTools
let readManifest: (dir: string, paths?: readonly string[]) => Promise<{ name?: string; version: string; description: string }>
let registryFactory: () => { manifestPaths(): string[]; registerManifests(paths: readonly string[]): () => void }
let readablePlaces: (providers: readonly SkillProvider[], chosen: readonly string[]) => SkillPlace[]
let collectorFactory: (home: string) => { add(source: string, manifests?: readonly string[]): Promise<{ record: { name: string; version: string; description: string } }> }
let createFiles: (options: { home: string; folder: string; userHome: string }) => McpIo["files"]
beforeAll(async () => {
  if (!enabled) return
  const [mcp, files, prompts, describePack, registry, cordis, skills, library, collect] = await Promise.all(hostFiles.map((file) => import(pathToFileURL(path.join(checkout, file)).href)))
  hostTools = mcp.mcpTools
  createFiles = files.createFsPlaceFiles
  promptTools = prompts.promptTools
  readManifest = describePack.readManifestFields
  registryFactory = () => new registry.PluginService(new cordis.Context(), {})
  readablePlaces = skills.readablePlaces
  collectorFactory = (home) => collect.createPluginCollector(library.createFsPluginLibrary(home))
})
const trees: string[] = []
afterEach(async () => { await Promise.all(trees.splice(0).map((tree) => rm(tree, { recursive: true, force: true }))) })
async function roots() {
  const root = await mkdtemp(path.join(tmpdir(), "qoder-host-"))
  trees.push(root)
  const home = path.join(root, "hub"), folder = path.join(root, "work"), userHome = path.join(root, "user")
  await Promise.all([home, folder, userHome].map((dir) => mkdir(dir)))
  const files = createFiles({ home, folder, userHome })
  return { folder, userHome, io: { files, log() {} } satisfies McpIo, promptIo: { files, workspace: async () => folder } as PromptIo }
}
const serverKey = "mcp" + "Servers"
const local = { transport: "stdio" as const, command: "node", args: ["server.js"], env: {} }

;(enabled ? describe : describe.skip)("真实宿主文件端口", () => {
  it("技能位置随 Qoder 选择状态过滤", () => {
    const providers: SkillProvider[] = []
    apply({
      skills: { register: (provider) => providers.push(provider) }, mcp: { tools: hostTools, register: () => undefined },
      prompts: { tools: promptTools, register: () => undefined }, plugins: { registerManifests: () => undefined, register: () => undefined },
      targets: { register: () => undefined }, locales: { register: () => undefined },
    })
    expect(readablePlaces(providers, [])).toEqual([])
    expect(readablePlaces(providers, ["hub.target.qoder"]).map((place) => `${place.scope}:${place.dir}`))
      .toEqual(["workspace:.qoder/skills", "global:.qoder/skills"])
  })
  it("仅凭原生清单识别元数据，停用扩展后撤销清单贡献", async () => {
    const { folder } = await roots()
    const dir = path.join(folder, "pack")
    await mkdir(path.join(dir, ".qoder-plugin"), { recursive: true })
    const manifest = JSON.stringify({ name: "native-test", version: "1.2.3", description: "native fixture", skills: "./special" })
    await writeFile(path.join(dir, ".qoder-plugin/plugin.json"), manifest)
    const registry = registryFactory()
    let dispose = () => {}
    apply({
      skills: { register: () => undefined }, mcp: { tools: hostTools, register: () => undefined },
      prompts: { tools: promptTools, register: () => undefined },
      plugins: { registerManifests: (paths) => { dispose = registry.registerManifests(paths) }, register: () => undefined },
      targets: { register: () => undefined }, locales: { register: () => undefined },
    })
    expect(await readManifest(dir)).not.toMatchObject({ name: "native-test" })
    expect(await readManifest(dir, registry.manifestPaths())).toMatchObject({ name: "native-test", version: "1.2.3", description: "native fixture" })
    const collection = await collectorFactory(path.join(folder, "hub-library")).add(dir, registry.manifestPaths())
    expect(collection.record).toMatchObject({ name: "native-test", version: "1.2.3", description: "native fixture" })
    expect(await readFile(path.join(dir, ".qoder-plugin/plugin.json"), "utf8")).toBe(manifest)
    dispose()
    expect(registry.manifestPaths()).not.toContain(".qoder-plugin/plugin.json")
    expect(await readManifest(dir, registry.manifestPaths())).not.toMatchObject({ name: "native-test" })
  })
  it("使用宿主 slug 和标记段管理真实隔离目录", async () => {
    const { folder, userHome, promptIo } = await roots()
    const provider = createQoderPrompts(() => null, promptTools)
    const prompt = { name: "中文 / Review!", description: "", prompt: "# Review\nInspect changes." }
    for (const [place, base] of [["qoder", folder], ["qoder-global", userHome]]) {
      for (const [form, directory] of [["commands", "commands"], ["rule", "rules"], ["agent", "agents"]]) {
        await provider.install(promptIo, place!, prompt, form!)
        const file = path.join(base!, ".qoder", directory!, `${promptTools.slugOf(prompt.name)}.md`)
        const content = await readFile(file, "utf8")
        expect(content).toContain(`<!-- context-hub:${promptTools.slugOf(prompt.name)} -->`)
        if (form !== "rule") expect(content).toContain("description: Review")
        else expect(content.startsWith("---")).toBe(false)
        await provider.remove(promptIo, place!, prompt, form!)
        expect(existsSync(file)).toBe(false)
      }
    }
    const instructions = path.join(userHome, ".qoder/AGENTS.md")
    await mkdir(path.dirname(instructions), { recursive: true })
    await writeFile(instructions, "# Existing\nKeep this.\n")
    await provider.install(promptIo, "qoder-global", prompt, "instructions")
    expect(await readFile(instructions, "utf8")).toContain("Keep this.")
    await provider.remove(promptIo, "qoder-global", prompt, "instructions")
    expect(await readFile(instructions, "utf8")).toContain("Keep this.")
  })
  it("在 JSONC 中保留注释、禁用状态及相邻配置", async () => {
    const { userHome, io } = await roots()
    const file = path.join(userHome, ".qoder/settings.json")
    await mkdir(path.dirname(file), { recursive: true })
    const input = `{\n  // keep comment\n  "hooks": { "keep": true },\n  "${serverKey}": { "server": { "command": "old", "disabled": true, "timeout": 30 }, "other": { "command": "other" } }\n}\n`
    await writeFile(file, input)
    const provider = createQoderMcp(hostTools)
    await provider.install(io, "qoder-global", "server", local)
    let text = await readFile(file, "utf8")
    expect(text).toContain("// keep comment")
    let state = hostTools.parseJsonc(text) as Record<string, Record<string, Record<string, unknown>>>
    expect(state[serverKey].server).toMatchObject({ command: "node", disabled: true, timeout: 30 })
    expect(state[serverKey].other.command).toBe("other")
    expect(state.hooks.keep).toBe(true)
    await provider.setEnabled(io, "qoder-global", "global", "server", true)
    text = await readFile(file, "utf8")
    state = hostTools.parseJsonc(text) as Record<string, Record<string, Record<string, unknown>>>
    expect(state[serverKey].server.disabled).toBe(false)
    const lines = await provider.locate(io, "qoder-global", "server")
    expect(lines).not.toBeNull()
    expect(text.split("\n").slice(lines![0] - 1, lines![1]).join("\n")).toContain('"server"')
    await provider.uninstall(io, "qoder-global", "server")
    expect(await readFile(file, "utf8")).toContain('"other"')
  })

  it("在四个独立位置写入，并拒绝项目根非严格 JSON", async () => {
    const { folder, userHome, io } = await roots()
    const provider = createQoderMcp(hostTools)
    for (const place of provider.places) await provider.install(io, place.id, place.id, local)
    const files = [path.join(userHome, ".qoder/settings.json"), path.join(folder, ".mcp.json"), path.join(folder, ".qoder/settings.json"), path.join(folder, ".qoder/settings.local.json")]
    for (const [i, file] of files.entries()) {
      const doc = hostTools.parseJsonc(await readFile(file, "utf8")) as Record<string, Record<string, Record<string, unknown>>>
      expect(Object.keys(doc[serverKey])).toEqual([provider.places[i]!.id])
    }
    const invalid = '{ /* comment */ "other": true }'
    await writeFile(files[1]!, invalid)
    await expect(provider.install(io, "qoder-project", "server", local)).rejects.toMatchObject({ key: "qoder.error.json" })
    expect(await readFile(files[1]!, "utf8")).toBe(invalid)
  })
})
