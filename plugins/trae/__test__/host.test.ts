import { existsSync } from "node:fs"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import type { McpIo, McpTools, PromptIo, PromptTools, SkillPlace, SkillProvider } from "../src/contracts.ts"
import { createTraeIdeMcp } from "../src/provider.ts"
import { createTraeCliMcp } from "../src/cli-provider.ts"
import { createTraeIdePrompts } from "../src/prompts.ts"
import { apply } from "../src/index.tsx"

const checkout = process.env.CONTEXT_HUB_CHECKOUT
const enabled = !!checkout?.trim()
const modules = [
  "packages/resources/mcp/src/toolkit.ts",
  "packages/resources/prompts/src/toolkit.ts",
  "packages/core/src/host/place-files.ts",
  "packages/resources/skills/src/provider.ts",
  "packages/resources/skills/src/host/skills-fs.ts",
] as const
if (enabled) {
  if (!path.isAbsolute(checkout!)) throw new Error("CONTEXT_HUB_CHECKOUT must be absolute")
  for (const file of modules) if (!existsSync(path.join(checkout!, file))) throw new Error(`Missing host source: ${file}`)
}
let host: {
  mcp: McpTools
  prompts: PromptTools
  files: (options: { home: string; folder: string; userHome: string }) => PromptIo["files"]
  readablePlaces: (providers: SkillProvider[], chosen: string[]) => SkillPlace[]
  skillStore: (options: { home: string; folder: string; userHome: string }) => Promise<{ placeSkills(ref: { scope: string; dir: string }): Promise<{ skills: { name: string }[] } | null> }>
}
const trees: string[] = []
afterEach(async () => { await Promise.all(trees.splice(0).map((tree) => rm(tree, { recursive: true, force: true }))) })
async function roots() {
  const root = await mkdtemp(path.join(tmpdir(), "trae-hub-test-"))
  trees.push(root)
  const home = path.join(root, "hub")
  const folder = path.join(root, "workspace")
  const userHome = path.join(root, "user")
  await Promise.all([home, folder, userHome].map((dir) => mkdir(dir)))
  const files = host.files({ home, folder, userHome })
  return { home, folder, userHome, files, mcpIo: { files, log: () => undefined } as McpIo, promptIo: { files } as PromptIo }
}
async function put(file: string, text: string) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, text) }
const key = ["mcp", "Servers"].join("")
const local = { transport: "stdio" as const, command: "node", args: ["a b", "${workspaceFolder}"], env: {} }
const describeHost = enabled ? describe : describe.skip

describeHost("host file ports and editors", () => {
  beforeAll(async () => {
    const loaded = await Promise.all(modules.map((file) => import(pathToFileURL(path.join(checkout!, file)).href)))
    host = { mcp: loaded[0]!.mcpTools, prompts: loaded[1]!.promptTools, files: loaded[2]!.createFsPlaceFiles,
      readablePlaces: loaded[3]!.readablePlaces, skillStore: loaded[4]!.createFsSkillStore }
  })
  it("keeps JSONC and TOML unrelated content, isolates both MCP files, and locates quoted names", async () => {
    const { folder, userHome, mcpIo } = await roots()
    const ideFile = path.join(folder, ".trae/mcp.json")
    const cliFile = path.join(userHome, ".trae/traecli.toml")
    await put(ideFile, `{\n  // preserve IDE comment\n  "theme": "dark",\n  "${key}": { "other": { "command": "old" } }\n}\n`)
    await put(cliFile, '# preserve CLI comment\nmodel = "example"\n\n[projects."/project"]\ntrust_level = "trusted"\n\n[plugins."other@market"]\nenabled = false\n')
    const ide = createTraeIdeMcp(host.mcp)
    const cli = createTraeCliMcp(host.mcp)
    await ide.install(mcpIo, "trae-ide-mcp", "server.with.dot", local)
    const beforeCli = await readFile(cliFile, "utf8")
    expect(beforeCli).not.toContain("server.with.dot")
    await cli.install(mcpIo, "trae-cli-mcp-global", "server.with.dot", local)
    const ideText = await readFile(ideFile, "utf8")
    const cliText = await readFile(cliFile, "utf8")
    expect(ideText).toContain("// preserve IDE comment")
    expect(ideText).toContain('"theme": "dark"')
    expect(cliText).toContain("# preserve CLI comment")
    expect(cliText).toContain('trust_level = "trusted"')
    expect(cliText).toContain('[plugins."other@market"]')
    expect((await cli.read(mcpIo, "trae-cli-mcp-global"))[0]?.declaration).toEqual(local)
    for (const [provider, place, text] of [[ide, "trae-ide-mcp", ideText], [cli, "trae-cli-mcp-global", cliText]] as const) {
      const range = await provider.locate(mcpIo, place, "server.with.dot")
      expect(range).not.toBeNull()
      expect(text.split("\n").slice(range![0] - 1, range![1]).join("\n")).toContain("server.with.dot")
    }
    await cli.uninstall(mcpIo, "trae-cli-mcp-global", "server.with.dot")
    expect(await readFile(ideFile, "utf8")).toBe(ideText)
    expect(await readFile(cliFile, "utf8")).toContain('trust_level = "trusted"')
  })
  it("refuses unconfirmed CLI forms and malformed documents without writes", async () => {
    const { userHome, mcpIo } = await roots()
    const file = path.join(userHome, ".trae/traecli.toml")
    const original = '[mcp_servers.remote]\nurl = "https://example.test"\nbearer_token_env_var = "TOKEN"\n'
    await put(file, original)
    const cli = createTraeCliMcp(host.mcp)
    expect((await cli.read(mcpIo, "trae-cli-mcp-global"))[0]?.declaration).toBeNull()
    await expect(cli.install(mcpIo, "trae-cli-mcp-global", "remote", local)).rejects.toThrow()
    await expect(cli.uninstall(mcpIo, "trae-cli-mcp-global", "remote")).rejects.toThrow()
    await expect(cli.install(mcpIo, "trae-cli-mcp-global", "new", { ...local, env: { TOKEN: "x" } })).rejects.toThrow()
    expect(await readFile(file, "utf8")).toBe(original)
    await put(file, "[mcp_servers\n")
    await expect(cli.install(mcpIo, "trae-cli-mcp-global", "new", local)).rejects.toThrow()
    expect(await readFile(file, "utf8")).toBe("[mcp_servers\n")
  })
  it("preserves representable CLI entry fields and refuses unsafe field shapes", async () => {
    const { userHome, mcpIo } = await roots()
    const file = path.join(userHome, ".trae/traecli.toml")
    const initial = '[mcp_servers."dotted.name"]\ncommand = "old"\ncustom = "keep"\n'
    await put(file, initial)
    const cli = createTraeCliMcp(host.mcp)
    await cli.install(mcpIo, "trae-cli-mcp-global", "dotted.name", local)
    const written = await readFile(file, "utf8")
    expect(written).toContain('custom = "keep"')
    expect((await cli.read(mcpIo, "trae-cli-mcp-global"))[0]?.declaration).toEqual(local)
    const invalid = '[mcp_servers.example]\ncommand = "node"\ncustom = 42\n'
    await put(file, invalid)
    await expect(cli.install(mcpIo, "trae-cli-mcp-global", "example", local)).rejects.toThrow()
    expect(await readFile(file, "utf8")).toBe(invalid)
  })
  it("writes and removes only owned project rules", async () => {
    const { folder, promptIo } = await roots()
    const provider = createTraeIdePrompts(() => null, host.prompts)
    const prompt = { name: "Code Review", description: 'First\n"second"', prompt: "Review $ARGUMENTS." }
    const file = path.join(folder, ".trae/rules/code-review.md")
    await provider.install(promptIo, "trae-ide-rules", prompt, "rule")
    const written = await readFile(file, "utf8")
    expect(written).toContain('alwaysApply: false')
    expect(written).toContain('<!-- context-hub:code-review -->')
    expect(written).toContain('Review $ARGUMENTS.')
    expect(await provider.held(promptIo, "trae-ide-rules", prompt)).toEqual({ rule: true })
    await provider.remove(promptIo, "trae-ide-rules", prompt, "rule")
    expect(existsSync(file)).toBe(false)
    await put(file, '---\ndescription: "mine"\n---\nText\n<!-- context-hub:code-review -->\n')
    await expect(provider.install(promptIo, "trae-ide-rules", prompt, "rule")).rejects.toThrow()
    expect(await provider.remove(promptIo, "trae-ide-rules", prompt, "rule")).toBe(false)
  })
  it("reads the shared and IDE skill directories separately, without CLI skill places", async () => {
    const { home, folder, userHome } = await roots()
    for (const [root, dir, name] of [[folder, ".agents/skills", "shared"], [folder, ".trae/skills", "project"], [userHome, ".trae-cn/skills", "global"]]) {
      await put(path.join(root!, dir!, name!, "SKILL.md"), `---\nname: ${name}\ndescription: test\n---\n`)
    }
    const providers: SkillProvider[] = []
    apply({ skills: { register: (provider) => providers.push(provider) }, mcp: { tools: host.mcp, register: () => undefined },
      prompts: { tools: host.prompts, register: () => undefined }, targets: { register: () => undefined }, locales: { register: () => undefined } })
    const shared = { id: "shared", shared: true, places: [{ id: "shared", labelKey: "shared", icon: () => null, scope: "workspace" as const, dir: ".agents/skills", order: 10 }] }
    const places = host.readablePlaces([shared, ...providers], ["hub.target.trae-ide", "hub.target.trae-cli"])
    expect(places.map((place) => place.dir)).toEqual([".agents/skills", ".trae/skills", ".trae-cn/skills"])
    const store = await host.skillStore({ home, folder, userHome })
    const names = await Promise.all(places.map(async (place) => (await store.placeSkills(place))?.skills.map((skill) => skill.name)))
    expect(names).toEqual([["shared"], ["project"], ["global"]])
  })
})
