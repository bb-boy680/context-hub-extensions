import { existsSync } from "node:fs"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import type { McpTools, PromptFiles, PromptTools } from "../src/contracts.ts"
import { createQwenCodeMcp } from "../src/provider.ts"
import { createQwenCodePrompts } from "../src/prompts.ts"

const checkout = process.env.CONTEXT_HUB_CHECKOUT
if (checkout && (!path.isAbsolute(checkout) || !existsSync(path.join(checkout, "packages/resources/mcp/src/toolkit.ts")))) throw new Error("Invalid CONTEXT_HUB_CHECKOUT")
const trees: string[] = []
afterEach(async () => { await Promise.all(trees.splice(0).map(tree => rm(tree, { recursive: true, force: true }))) })
async function load(relative: string) { return import(pathToFileURL(path.join(checkout!, relative)).href) }

describe.skipIf(!checkout)("Qwen host integration", () => {
  it("edits actual JSONC and marked instructions only inside isolated roots", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-host-")); trees.push(root)
    const home = path.join(root, "hub"), folder = path.join(root, "work"), userHome = path.join(root, "user")
    await Promise.all([mkdir(home), mkdir(folder), mkdir(userHome)])
    const [{ mcpTools }, { promptTools }, { createFsPlaceFiles }] = await Promise.all([
      load("packages/resources/mcp/src/toolkit.ts"), load("packages/resources/prompts/src/toolkit.ts"), load("packages/core/src/host/place-files.ts"),
    ]) as [{ mcpTools: McpTools }, { promptTools: PromptTools }, { createFsPlaceFiles(options: { home: string; folder: string; userHome: string }): PromptFiles }]
    const files = createFsPlaceFiles({ home, folder, userHome })
    const io = { files, workspace: () => files.workspace(), log() {} }
    const ref = { scope: "workspace", file: ".qwen/settings.json" } as const
    await files.write(ref, '{\n  // preserve\n  "theme": "dark",\n  "mcpServers": { "other": { "command": "keep" } }\n}\n')
    const mcp = createQwenCodeMcp(mcpTools)
    await mcp.install(io, "qwen-code", "http", { transport: "http", url: "https://example.test", headers: { Authorization: "${TOKEN}" } })
    const written = await files.read(ref)
    expect(written).toContain("// preserve")
    expect(written).toContain('"theme": "dark"')
    expect((await mcp.read(io, "qwen-code")).find(row => row.name === "http")?.declaration).toEqual({ transport: "http", url: "https://example.test", headers: { Authorization: "${TOKEN}" } })
    expect(await mcp.locate(io, "qwen-code", "http")).not.toBeNull()
    await mcp.uninstall(io, "qwen-code", "http")
    const prompts = createQwenCodePrompts(() => null, promptTools)
    const prompt = { name: "Review", description: "Review", prompt: "Inspect ${INPUT}" }
    const instruction = { scope: "workspace", file: "QWEN.md" } as const
    await files.write(instruction, "Existing text\n")
    await prompts.install(io, "qwen-code", prompt, "instructions")
    expect(await files.read(instruction)).toContain("Existing text")
    expect(await prompts.remove(io, "qwen-code", prompt, "instructions")).toBe(true)
    expect(await files.read(instruction)).toContain("Existing text")
  })
  it("filters native skill places by selected target", async () => {
    const [{ SkillService, readablePlaces }, { Context }] = await Promise.all([
      load("packages/resources/skills/src/provider.ts"), load("packages/extensions/src/cordis.ts"),
    ])
    const { apply } = await import("../src/index.tsx")
    const registry = new SkillService(new Context())
    let dispose = () => {}
    apply({
      skills: { register(value) { dispose = registry.register(value) } },
      mcp: { tools: {} as McpTools, register() {} },
      prompts: { tools: {} as PromptTools, register() {} },
      plugins: { registerManifests() {}, register() {} },
      targets: { register() {} },
      locales: { register() {} },
    })
    expect(readablePlaces(registry.providers(), []).length).toBe(0)
    expect(readablePlaces(registry.providers(), ["hub.target.qwen-code"]).map((place: { id: string }) => place.id)).toEqual(["qwen-code", "qwen-code-global"])
    dispose()
    expect(registry.providers()).toEqual([])
  })
  it("installs, switches, updates and removes a native package through the real host port", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-lifecycle-")); trees.push(root)
    const home = path.join(root, "hub"), folder = path.join(root, "work"), userHome = path.join(root, "user")
    await Promise.all([mkdir(home), mkdir(folder), mkdir(userHome)])
    const [{ createFsPluginLibrary }, { createInstallerFiles }, { createQwenCodeInstaller }] = await Promise.all([
      load("packages/resources/plugins/src/host/library.ts"), load("packages/resources/plugins/src/host/installer-files.ts"), import("../src/installer.ts"),
    ])
    const library = createFsPluginLibrary(home)
    const stage = async (version: string) => {
      const dir = path.join(root, `stage-${version}`)
      await mkdir(dir)
      await writeFile(path.join(dir, "qwen-extension.json"), JSON.stringify({ name: "demo", version }))
      await writeFile(path.join(dir, "component.md"), `version ${version}`)
      return dir
    }
    const origin = { kind: "local", path: root }
    await library.add("demo", await stage("1.0.0"), origin, "one", ["qwen-extension.json"])
    const journalWrites: Record<string, unknown>[] = []
    let failProjection = false
    const { writeFileAtomic } = await load("packages/core/src/host/atomic.ts")
    const disk = createInstallerFiles({ library, workspace: async () => folder, userHome, env: {}, write: async (file: string, text: string) => {
      if (failProjection && file.endsWith("extension-enablement.json")) throw new Error("projection unavailable")
      if (file.includes(`${path.sep}transactions${path.sep}`)) journalWrites.push(JSON.parse(text))
      await writeFileAtomic(file, text)
    } })
    const forbidden = async () => { throw new Error("external operation forbidden") }
    const tools = { disk, files: null, packs: async () => [], root: async () => library.root, syncMarketplace: forbidden, run: forbidden, has: forbidden, describe: forbidden }
    const installer = createQwenCodeInstaller()
    await installer.install("demo", "user", tools)
    const first = await installer.held(tools)
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ name: "demo", enabled: true, readOnly: false })
    const id = first[0]!.id
    const statePath = path.join(userHome, ".qwen", "extension-store", "state.json")
    const beforeRepeat = await readFile(statePath, "utf8")
    await installer.install("demo", "user", tools)
    expect(await readFile(statePath, "utf8")).toBe(beforeRepeat)
    failProjection = true
    expect((await installer.setEnabled!(id, "user", false, tools)).warning).toContain("projection unavailable")
    const committedState = JSON.parse(await readFile(statePath, "utf8"))
    expect(committedState.extensions[id].defaultActivation).toBe("disabled")
    expect((await installer.held(tools))[0]).toMatchObject({ readOnly: true })
    const projectionPath = path.join(userHome, ".qwen", "extensions", "extension-enablement.json")
    const staleProjection = await readFile(projectionPath, "utf8")
    await expect(installer.setEnabled!(id, "user", true, tools)).rejects.toThrow(/reconciliation/)
    expect(await readFile(projectionPath, "utf8")).toBe(staleProjection)
    expect(await readFile(statePath, "utf8")).toBe(JSON.stringify(committedState, null, 2))
    failProjection = false
    const { qwenProjection } = await import("../src/plugin-state.ts")
    await writeFile(path.join(userHome, ".qwen", "extensions", "extension-enablement.json"), JSON.stringify(qwenProjection(committedState), null, 2))
    await installer.setEnabled!(id, "user", true, tools)
    await installer.setEnabled!(id, "project", false, tools)
    expect((await installer.switches!(tools)).project[id]).toBe(false)
    await installer.clearEnabled!(id, "project", tools)
    expect((await installer.switches!(tools)).project[id]).toBe(true)
    expect((await installer.held(tools))[0]).toMatchObject({ name: "demo", readOnly: false })
    await installer.setEnabled!(id, "project", false, tools)
    await installer.setEnabled!(id, "user", false, tools)
    await installer.setEnabled!(id, "user", true, tools)
    expect((await installer.switches!(tools)).project[id]).toBe(false)
    await library.replace("demo", await stage("2.0.0"), origin, "two", ["qwen-extension.json"])
    await installer.install("demo", "user", tools)
    expect((await installer.held(tools))[0]).toMatchObject({ version: "2.0.0", readOnly: false })
    expect((await installer.switches!(tools)).project[id]).toBe(false)
    await expect(installer.remove(id, "project", tools)).rejects.toThrow()
    await installer.remove(id, "user", tools)
    expect(await installer.held(tools)).toEqual([])
    const snapshot = JSON.parse(await readFile(path.join(userHome, ".qwen", "extension-store", "state.json"), "utf8"))
    expect(snapshot.extensions).toEqual({})
    expect(JSON.parse(await readFile(path.join(userHome, ".qwen", "extensions", "extension-enablement.json"), "utf8"))).toEqual({})
    expect(journalWrites.map(journal => journal.phase)).toEqual([
      "prepared", "artifact_swapped", "state_committed",
      "prepared", "artifact_swapped", "state_committed",
      "prepared", "artifact_swapped", "state_committed",
    ])
    for (const journal of journalWrites) {
      expect(journal.version).toBe(1)
      expect(typeof journal.transactionId).toBe("string")
      expect(journal.targetGeneration).toBe((journal.previousGeneration as number) + 1)
      expect((journal.targetSnapshot as { generation: number }).generation).toBe(journal.targetGeneration)
      expect(journal.destinationDirectory).toBe(path.join(userHome, ".qwen", "extensions", "demo"))
    }
  })

  it("can initially install for one project without enabling it globally", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-project-")); trees.push(root)
    const home = path.join(root, "hub"), folder = path.join(root, "work"), userHome = path.join(root, "user"), stage = path.join(root, "stage")
    await Promise.all([mkdir(home), mkdir(folder), mkdir(userHome), mkdir(stage)])
    await writeFile(path.join(stage, "qwen-extension.json"), JSON.stringify({ name: "demo", version: "1", settings: [] }))
    const [{ createFsPluginLibrary }, { createInstallerFiles }, { createQwenCodeInstaller }] = await Promise.all([
      load("packages/resources/plugins/src/host/library.ts"), load("packages/resources/plugins/src/host/installer-files.ts"), import("../src/installer.ts"),
    ])
    const library = createFsPluginLibrary(home)
    await library.add("demo", stage, { kind: "local", path: root }, "one", ["qwen-extension.json"])
    const disk = createInstallerFiles({ library, workspace: async () => folder, userHome, env: {} })
    const forbidden = async () => { throw new Error("external operation forbidden") }
    const tools = { disk, files: null, packs: async () => [], root: async () => library.root, syncMarketplace: forbidden, run: forbidden, has: forbidden, describe: forbidden }
    const installer = createQwenCodeInstaller()
    const { qwenProjection, qwenProjectionHash } = await import("../src/plugin-state.ts")
    const snapshot = { version: 2 as const, generation: 4, legacyProjectionHash: "", extensions: {}, legacyProjectionRemainder: { DEMO: { overrides: ["!/*"] }, Other: { overrides: ["/other/"] } } }
    const projection = qwenProjection(snapshot)
    snapshot.legacyProjectionHash = await qwenProjectionHash(projection)
    const store = path.join(userHome, ".qwen", "extension-store")
    await mkdir(store, { recursive: true })
    await mkdir(path.join(userHome, ".qwen", "extensions"), { recursive: true })
    await writeFile(path.join(userHome, ".qwen", "extensions", "extension-enablement.json"), JSON.stringify(projection, null, 2))
    await writeFile(path.join(store, "state.json"), JSON.stringify(snapshot))
    await installer.install("demo", "project", tools)
    const state = JSON.parse(await readFile(path.join(store, "state.json"), "utf8"))
    expect(state.legacyProjectionRemainder).toEqual({ Other: { overrides: ["/other/"] } })
    expect(Object.values(state.extensions)[0]).toMatchObject({ legacyPathRules: ["!/*"] })
    const pack = (await installer.held(tools))[0]!
    const switches = await installer.switches!(tools)
    expect(switches.user[pack.id]).toBe(false)
    expect(switches.project[pack.id]).toBe(true)
    await installer.clearEnabled!(pack.id, "project", tools)
    expect((await installer.switches!(tools)).project[pack.id]).toBe(false)
    await installer.install("demo", "project", tools)
    expect((await installer.switches!(tools)).project[pack.id]).toBe(true)
    expect((await installer.switches!(tools)).user[pack.id]).toBe(false)
    expect((await installer.held(tools))[0]).toMatchObject({ readOnly: false })
  })

  it("refuses unmanaged, changed, private and pending artifacts without replacing them", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-refusal-")); trees.push(root)
    const home = path.join(root, "hub"), folder = path.join(root, "work"), userHome = path.join(root, "user")
    await Promise.all([mkdir(home), mkdir(folder), mkdir(userHome)])
    const [{ createFsPluginLibrary }, { createInstallerFiles }, { createQwenCodeInstaller }] = await Promise.all([
      load("packages/resources/plugins/src/host/library.ts"), load("packages/resources/plugins/src/host/installer-files.ts"), import("../src/installer.ts"),
    ])
    const library = createFsPluginLibrary(home), stage = path.join(root, "stage")
    await mkdir(stage)
    await writeFile(path.join(stage, "qwen-extension.json"), JSON.stringify({ name: "demo", version: "1" }))
    await writeFile(path.join(stage, "component.md"), "from library")
    await library.add("demo", stage, { kind: "local", path: root }, "one", ["qwen-extension.json"])
    const disk = createInstallerFiles({ library, workspace: async () => folder, userHome, env: {} })
    const forbidden = async () => { throw new Error("external operation forbidden") }
    const tools = { disk, files: null, packs: async () => [], root: async () => library.root, syncMarketplace: forbidden, run: forbidden, has: forbidden, describe: forbidden }
    const installer = createQwenCodeInstaller()
    const artifact = path.join(userHome, ".qwen", "extensions", "demo")
    await mkdir(artifact, { recursive: true })
    await writeFile(path.join(artifact, "qwen-extension.json"), JSON.stringify({ name: "demo", version: "external" }))
    expect((await installer.held(tools))[0]).toMatchObject({ readOnly: true })
    await expect(installer.install("demo", "user", tools)).rejects.toThrow(/unmanaged/)
    expect(JSON.parse(await readFile(path.join(artifact, "qwen-extension.json"), "utf8")).version).toBe("external")
    await rm(artifact, { recursive: true })
    await installer.install("demo", "user", tools)
    const id = (await installer.held(tools))[0]!.id
    await writeFile(path.join(artifact, "component.md"), "person changed this")
    expect((await installer.held(tools))[0]).toMatchObject({ readOnly: true })
    await expect(installer.remove(id, "user", tools)).rejects.toThrow(/changed/)
    expect(await readFile(path.join(artifact, "component.md"), "utf8")).toBe("person changed this")
    const source = library.packDir("demo")
    await writeFile(path.join(source, ".env"), "fixture only")
    await expect(installer.install("demo", "user", tools)).rejects.toThrow(/private/)
    expect(await readFile(path.join(artifact, "component.md"), "utf8")).toBe("person changed this")
    await writeFile(path.join(artifact, "component.md"), "from library")
    const pending = path.join(userHome, ".qwen", "extension-store", "transactions")
    await mkdir(pending, { recursive: true })
    await writeFile(path.join(pending, "external.json"), "{}")
    expect((await installer.held(tools))[0]).toMatchObject({ readOnly: true })
    expect((await installer.held(tools))[0]?.enabled).toBeUndefined()
    await expect(installer.setEnabled!(id, "user", false, tools)).rejects.toThrow(/transaction.*recovery/i)
    expect(await readFile(path.join(pending, "external.json"), "utf8")).toBe("{}")
    await rm(path.join(pending, "external.json"))
    const staging = path.join(userHome, ".qwen", "extension-store", "staging")
    await mkdir(staging, { recursive: true })
    const { symlink } = await import("node:fs/promises")
    await symlink(root, path.join(staging, "unexpected"), "junction")
    expect((await installer.held(tools))[0]).toMatchObject({ readOnly: true })
    await expect(installer.setEnabled!(id, "user", false, tools)).rejects.toThrow(/transaction.*recovery/i)
  })

  it("rejects old state before creating a lock or changing files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-old-state-")); trees.push(root)
    const home = path.join(root, "hub"), folder = path.join(root, "work"), userHome = path.join(root, "user"), stage = path.join(root, "stage")
    await Promise.all([mkdir(home), mkdir(folder), mkdir(userHome), mkdir(stage)])
    await writeFile(path.join(stage, "qwen-extension.json"), JSON.stringify({ name: "demo", version: "1" }))
    const [{ createFsPluginLibrary }, { createInstallerFiles }, { createQwenCodeInstaller }] = await Promise.all([
      load("packages/resources/plugins/src/host/library.ts"), load("packages/resources/plugins/src/host/installer-files.ts"), import("../src/installer.ts"),
    ])
    const library = createFsPluginLibrary(home)
    await library.add("demo", stage, { kind: "local", path: root }, "one", ["qwen-extension.json"])
    const disk = createInstallerFiles({ library, workspace: async () => folder, userHome, env: {} })
    const forbidden = async () => { throw new Error("external operation forbidden") }
    const tools = { disk, files: null, packs: async () => [], root: async () => library.root, syncMarketplace: forbidden, run: forbidden, has: forbidden, describe: forbidden }
    const store = path.join(userHome, ".qwen", "extension-store")
    await mkdir(store, { recursive: true })
    const old = '{"version":1,"extensions":{}}'
    await writeFile(path.join(store, "state.json"), old)
    await expect(createQwenCodeInstaller().install("demo", "user", tools)).rejects.toThrow()
    expect(await readFile(path.join(store, "state.json"), "utf8")).toBe(old)
    expect(existsSync(path.join(store, "lock"))).toBe(false)
    expect(existsSync(path.join(userHome, ".qwen", "extensions", "demo"))).toBe(false)
    await rm(path.join(store, "state.json"))
    await writeFile(path.join(library.packDir("demo"), "plugin.json"), JSON.stringify({ name: "demo" }))
    await expect(createQwenCodeInstaller().install("demo", "user", tools)).rejects.toThrow(/Mixed plugin manifests/)
    expect(existsSync(path.join(store, "lock"))).toBe(false)
    const artifact = path.join(userHome, ".qwen", "extensions", "demo")
    await mkdir(artifact, { recursive: true })
    await writeFile(path.join(artifact, "qwen-extension.json"), JSON.stringify({ name: "demo", version: "external" }))
    await writeFile(path.join(store, "state.json"), old)
    const [held] = await createQwenCodeInstaller().held(tools)
    expect(held).toMatchObject({ name: "demo", readOnly: true })
    expect(held?.enabled).toBeUndefined()
  })

  it("collects a native-only package and reads its components without execution", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-pack-")); trees.push(root)
    const stage = path.join(root, "stage"), home = path.join(root, "hub")
    await mkdir(path.join(stage, "custom", "skill"), { recursive: true })
    await mkdir(path.join(stage, "custom", "commands"), { recursive: true })
    await writeFile(path.join(stage, "custom", "skill", "SKILL.md"), "---\nname: example\ndescription: Skill\n---\nBody\n")
    await writeFile(path.join(stage, "custom", "commands", "run.md"), "---\ndescription: Command\n---\nBody\n")
    const marker = path.join(root, "script-executed")
    await writeFile(path.join(stage, "hook.cjs"), `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`)
    const manifest = { name: "demo", version: "1.0.0", description: "Native", skills: "custom/skill", commands: "custom/commands", mcpServers: { example: { command: "never-run" } }, agents: ["agents"], workflows: ["flows"], contextFileName: "QWEN.md" }
    await writeFile(path.join(stage, "qwen-extension.json"), JSON.stringify(manifest))
    const [{ createFsPluginLibrary }, { readPackContents }] = await Promise.all([load("packages/resources/plugins/src/host/library.ts"), load("packages/resources/plugins/src/host/contents.ts")])
    const library = createFsPluginLibrary(home)
    await library.add("demo", stage, { kind: "local", path: root }, "fixture", ["qwen-extension.json"])
    const dir = library.packDir("demo")
    const contents = await readPackContents(dir, ["qwen-extension.json"])
    expect(contents.skills[0].title).toBe("example")
    expect(contents.commands[0].title).toBe("run")
    expect(contents.mcp).toContain("never-run")
    expect(JSON.parse(await readFile(path.join(dir, "qwen-extension.json"), "utf8"))).toEqual(manifest)
    expect(existsSync(path.join(dir, "plugin.json"))).toBe(false)
    expect(existsSync(marker)).toBe(false)
    expect(existsSync(path.join(dir, "hook.cjs"))).toBe(true)
  })
})
