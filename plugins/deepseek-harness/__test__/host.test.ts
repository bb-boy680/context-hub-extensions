import { existsSync } from "node:fs"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import type { DeepSeekHarnessScope, PromptIo, PromptTools, SkillPlace, SkillProvider } from "../src/contracts.ts"
import { createDeepSeekHarnessPrompts } from "../src/prompts.ts"
import { apply } from "../src/index.tsx"

const checkout = process.env.CONTEXT_HUB_CHECKOUT
const enabled = checkout !== undefined && checkout.trim() !== ""
const hostFiles = [
  "packages/resources/skills/src/provider.ts",
  "packages/resources/skills/src/host/skills-fs.ts",
  "packages/resources/prompts/src/toolkit.ts",
  "packages/core/src/host/place-files.ts",
] as const
if (enabled) {
  if (!path.isAbsolute(checkout)) throw new Error("CONTEXT_HUB_CHECKOUT must be absolute")
  for (const file of hostFiles) {
    if (!existsSync(path.join(checkout, file))) throw new Error(`Missing host source: ${file}`)
  }
}

const trees: string[] = []
afterEach(async () => {
  await Promise.all(trees.splice(0).map((tree) => rm(tree, { recursive: true, force: true })))
})

const describeHost = enabled ? describe : describe.skip
describeHost("real host skills port", () => {
  let readablePlaces: (providers: readonly SkillProvider[], chosen: readonly string[]) => SkillPlace[]
  let createStore: (options: { home: string; folder: string; userHome: string }) => Promise<{
    placeSkills(ref: { scope: "workspace" | "global"; dir: string }): Promise<{ skills: { name: string }[] } | null>
    deleteInPlace(name: string, ref: { scope: "workspace" | "global"; dir: string }): Promise<void>
  }>

  beforeAll(async () => {
    const provider = await import(pathToFileURL(path.join(checkout!, hostFiles[0])).href)
    const store = await import(pathToFileURL(path.join(checkout!, hostFiles[1])).href)
    readablePlaces = provider.readablePlaces
    createStore = store.createFsSkillStore
  })

  it("filters both client places and scans and removes only the selected physical directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dsh-hub-test-"))
    trees.push(root)
    const home = path.join(root, "hub")
    const folder = path.join(root, "workspace")
    const userHome = path.join(root, "user")
    for (const [base, name] of [[folder, "workspace-skill"], [userHome, "global-skill"]]) {
      const dir = path.join(base!, ".dsh/skills", name!)
      await mkdir(dir, { recursive: true })
      await writeFile(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: test\n---\n`)
    }
    const providers: SkillProvider[] = []
    apply({
      skills: { register: (value) => providers.push(value) },
      plugins: { registerManifestRules: () => undefined, register: () => undefined },
      mcp: { tools: {} as DeepSeekHarnessScope["mcp"]["tools"], register: () => undefined },
      prompts: { tools: {} as DeepSeekHarnessScope["prompts"]["tools"], register: () => undefined },
      targets: { register: () => undefined }, locales: { register: () => undefined },
    } as DeepSeekHarnessScope)
    const shared: SkillProvider = {
      id: "hub.skill.catalog", shared: true,
      places: [{ id: "workspace", labelKey: "skills.tab.workspace", icon: () => null, scope: "workspace", dir: ".agents/skills", order: 10 }],
    }
    expect(readablePlaces([shared, ...providers], []).map((p) => p.dir)).toEqual([".agents/skills"])
    const places = readablePlaces([shared, ...providers], ["hub.target.deepseek-harness"])
    expect(places.map((p) => `${p.scope}:${p.dir}`)).toEqual([
      "workspace:.agents/skills", "workspace:.dsh/skills", "global:.dsh/skills",
    ])
    const store = await createStore({ home, folder, userHome })
    expect((await store.placeSkills(places[1]!))?.skills.map((s) => s.name)).toEqual(["workspace-skill"])
    expect((await store.placeSkills(places[2]!))?.skills.map((s) => s.name)).toEqual(["global-skill"])
    await store.deleteInPlace("workspace-skill", places[1]!)
    expect(existsSync(path.join(folder, ".dsh/skills/workspace-skill/SKILL.md"))).toBe(false)
    expect(existsSync(path.join(userHome, ".dsh/skills/global-skill/SKILL.md"))).toBe(true)
  })
})

describeHost("real host instruction files", () => {
  it("adds, updates, reads and removes sections without losing user content", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dsh-instructions-test-"))
    trees.push(root)
    const userHome = path.join(root, "user")
    const folder = path.join(root, "workspace")
    const home = path.join(root, "hub")
    const filesModule = await import(pathToFileURL(path.join(checkout!, hostFiles[3])).href)
    const toolsModule = await import(pathToFileURL(path.join(checkout!, hostFiles[2])).href)
    const files = filesModule.createFsPlaceFiles({ home, folder, userHome }) as PromptIo["files"]
    const io: PromptIo = { files, workspace: () => files.workspace() }
    const provider = createDeepSeekHarnessPrompts(() => null, toolsModule.promptTools as PromptTools)
    const place = "deepseek-harness-global"
    const prompt = { name: "Code Review", description: "Review", prompt: "Review the diff." }
    const file = path.join(userHome, ".dsh/AGENTS.md")
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, "# Personal rules\r\n\r\nKeep this.\r\n")
    expect(await provider.held(io, place, prompt)).toEqual({})
    const other = { name: "Another", description: "Other", prompt: "Other content." }
    await provider.install(io, place, other, "instructions")
    await provider.install(io, place, prompt, "instructions")
    await provider.install(io, place, { ...prompt, prompt: "Updated." }, "instructions")
    const contents = await readFile(file, "utf8")
    expect(contents).toContain("Keep this.\r\n")
    expect(contents).toContain("Updated.\r\n")
    expect(contents.split("<!-- context-hub:code-review -->")).toHaveLength(2)
    expect(await provider.held(io, place, prompt)).toEqual({ instructions: true })
    expect(await provider.remove(io, place, prompt, "instructions")).toBe(true)
    expect(await readFile(file, "utf8")).toContain("Other content.")
    expect(await provider.held(io, place, other)).toEqual({ instructions: true })
    expect(await provider.remove(io, place, other, "instructions")).toBe(true)
    expect(await readFile(file, "utf8")).toBe("# Personal rules\r\n\r\nKeep this.\r\n")
    expect(await provider.remove(io, place, prompt, "instructions")).toBe(false)
    expect(existsSync(path.join(folder, "AGENTS.md"))).toBe(false)
    await files.remove({ scope: "global", file: ".dsh/AGENTS.md" })
    await provider.install(io, place, prompt, "instructions")
    await provider.remove(io, place, prompt, "instructions")
    expect(existsSync(file)).toBe(false)
  })
})
