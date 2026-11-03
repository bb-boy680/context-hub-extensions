/**
 * The extension's providers against the real host toolkits and file ports.
 *
 * The hub checkout is named by `CONTEXT_HUB_CHECKOUT`; without it this suite is
 * skipped, so ordinary plugin CI still runs the unit tests and reports the
 * integration suite as skipped rather than passed. A release gate must set the
 * variable and run this file explicitly:
 *
 *   CONTEXT_HUB_CHECKOUT=D:/work-space/dsh-context-hub \
 *     pnpm --filter opencode test __test__/host.test.ts
 *
 * A value that is not an absolute path, or a checkout missing a file this suite
 * imports, fails instead of skipping. Every write goes under temporary
 * home/workspace/userHome roots created here and removed afterwards; no test
 * reads or writes a real client directory.
 */
import { existsSync } from "node:fs"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { afterEach, beforeAll, describe, expect, it } from "vitest"

import type {
  McpIo,
  McpProvider,
  McpTools,
  PromptFiles,
  PromptIo,
  PromptTools,
  SkillPlace,
  SkillProvider,
} from "../src/contracts.ts"
import { apply } from "../src/index.tsx"
import { createOpenCodeMcp } from "../src/provider.ts"
import { createOpenCodePrompts } from "../src/prompts.ts"

/** Every host source this suite imports; the target client is OpenCode v2.2.5. */
const HOST_FILES = [
  "packages/resources/mcp/src/toolkit.ts",
  "packages/resources/prompts/src/toolkit.ts",
  "packages/core/src/host/place-files.ts",
  "packages/resources/skills/src/provider.ts",
  "packages/resources/skills/src/library.ts",
  "packages/resources/skills/src/host/skills-fs.ts",
] as const

const CHECKOUT = process.env.CONTEXT_HUB_CHECKOUT
const ENABLED = typeof CHECKOUT === "string" && CHECKOUT.trim() !== ""

if (ENABLED) {
  if (!path.isAbsolute(CHECKOUT)) {
    throw new Error(`CONTEXT_HUB_CHECKOUT must be an absolute path: ${CHECKOUT}`)
  }
  for (const relative of HOST_FILES) {
    if (!existsSync(path.join(CHECKOUT, relative))) {
      throw new Error(`CONTEXT_HUB_CHECKOUT has no ${relative}`)
    }
  }
}

/** One skill a place holds, as the store reports it. */
interface PlaceSkills {
  root: string
  display: string
  skills: { name: string; description: string }[]
}

/** The part of the host `SkillStore` this suite uses. */
interface HostSkillStore {
  placeSkills(ref: { scope: "workspace" | "global"; dir: string }): Promise<PlaceSkills | null>
  deleteInPlace(name: string, ref: { scope: "workspace" | "global"; dir: string }): Promise<void>
}

/** The host functions this suite takes from the checkout. */
interface Host {
  mcpTools: McpTools & { parseJsonc(text: string): unknown }
  promptTools: PromptTools
  createFsPlaceFiles(options: {
    home?: string
    folder?: string
    userHome?: string
  }): PromptFiles
  readablePlaces(providers: readonly SkillProvider[], chosen: readonly string[]): SkillPlace[]
  skillPlaceKey(place: Pick<SkillPlace, "id" | "scope" | "dir">): string
  placePath(place: { scope: "workspace" | "global"; dir: string }): string
  createFsSkillStore(options: {
    home?: string
    folder?: string
    userHome?: string
  }): Promise<HostSkillStore>
}

let host: Host

/** The checkout, after the module-level checks. */
function checkout(): string {
  if (CHECKOUT === undefined || CHECKOUT.trim() === "") {
    throw new Error("this suite needs CONTEXT_HUB_CHECKOUT")
  }
  return CHECKOUT
}

/** Import one host source module through the same TypeScript loader as this test. */
async function load(relative: string): Promise<Record<string, unknown>> {
  return (await import(pathToFileURL(path.join(checkout(), relative)).href)) as Record<
    string,
    unknown
  >
}

beforeAll(async () => {
  const [mcp, prompts, files, provider, library, skills] = await Promise.all([
    load(HOST_FILES[0]),
    load(HOST_FILES[1]),
    load(HOST_FILES[2]),
    load(HOST_FILES[3]),
    load(HOST_FILES[4]),
    load(HOST_FILES[5]),
  ])
  host = {
    mcpTools: mcp.mcpTools as Host["mcpTools"],
    promptTools: prompts.promptTools as PromptTools,
    createFsPlaceFiles: files.createFsPlaceFiles as Host["createFsPlaceFiles"],
    readablePlaces: provider.readablePlaces as Host["readablePlaces"],
    skillPlaceKey: library.skillPlaceKey as Host["skillPlaceKey"],
    placePath: library.placePath as Host["placePath"],
    createFsSkillStore: skills.createFsSkillStore as Host["createFsSkillStore"],
  }
})

/** Every temporary directory this file made, removed whether a test passed. */
const trees: string[] = []

afterEach(async () => {
  await Promise.all(trees.splice(0).map((tree) => rm(tree, { recursive: true, force: true })))
})

async function temp(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), `opencode-${prefix}-`))
  trees.push(directory)
  return directory
}

/** Three isolated roots, as the host expects them passed explicitly. */
async function roots(): Promise<{
  home: string
  folder: string
  userHome: string
  files: PromptFiles
  mcpIo: McpIo
  promptIo: PromptIo
}> {
  const home = await temp("hub")
  const folder = await temp("work")
  const userHome = await temp("user")
  const files = host.createFsPlaceFiles({ home, folder, userHome })
  return {
    home,
    folder,
    userHome,
    files,
    mcpIo: { files, log: () => undefined },
    promptIo: { files, workspace: () => files.workspace() },
  }
}

/** Write a file and create its parents. */
async function put(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, text, "utf8")
}

/** Read a file as the client would see it. */
async function text(file: string): Promise<string> {
  return readFile(file, "utf8")
}

const local = {
  transport: "stdio" as const,
  command: "node",
  args: ["server.js", "--root", "a b"],
  env: { TOKEN: "kept" },
}

/** The OpenCode skill provider this extension registers, captured from apply. */
function openCodeProvider(): SkillProvider {
  const providers: SkillProvider[] = []
  apply({
    skills: {
      providers: () => providers,
      register: (provider: SkillProvider) => {
        providers.push(provider)
        return () => undefined
      },
    },
    mcp: { tools: {}, register: () => undefined },
    prompts: { tools: {}, register: () => undefined },
    targets: { register: () => undefined },
    locales: { register: () => undefined },
  } as never)
  const provider = providers[0]
  if (provider === undefined) throw new Error("apply registered no skill provider")
  return provider
}

const describeHost = ENABLED ? describe : describe.skip

describeHost("real host toolkits", () => {
  describe("JSONC MCP editing", () => {
    it("keeps comments, trailing commas and unrelated nodes while writing one entry", async () => {
      const { folder, mcpIo } = await roots()
      const file = path.join(folder, "opencode.jsonc")
      await put(
        file,
        `{
  // keep this comment
  "theme": "dark",
  "mcp": {
    "servers": {
      "existing": {
        "type": "local",
        "command": ["old", "--flag"],
        "disabled": true, // switch stays
        "timeout": { "execution": 30 },
      },
    },
  },
}
`
      )
      const provider: McpProvider = createOpenCodeMcp(host.mcpTools)

      await provider.install(mcpIo, "opencode-workspace-jsonc", "files", local)

      const written = await text(file)
      expect(written).toContain("// keep this comment")
      expect(written).toContain("// switch stays")
      expect(written).toContain('"theme": "dark"')
      const document = host.mcpTools.parseJsonc(written) as {
        mcp: { servers: Record<string, Record<string, unknown>> }
      }
      expect(document.mcp.servers.files).toEqual({
        type: "local",
        command: ["node", "server.js", "--root", "a b"],
        environment: { TOKEN: "kept" },
      })
      expect(document.mcp.servers.existing).toEqual({
        type: "local",
        command: ["old", "--flag"],
        disabled: true,
        timeout: { execution: 30 },
      })

      const entries = await provider.read(mcpIo, "opencode-workspace-jsonc")
      expect(entries.map((entry) => [entry.name, entry.enabled])).toEqual([
        ["existing", false],
        ["files", true],
      ])

      const setEnabled = provider.setEnabled
      if (setEnabled === undefined) throw new Error("setEnabled is missing")
      await setEnabled(mcpIo, "opencode-workspace-jsonc", "workspace", "files", false)
      const switched = await text(file)
      expect(switched).toContain("// keep this comment")
      const after = host.mcpTools.parseJsonc(switched) as {
        mcp: { servers: Record<string, Record<string, unknown>> }
      }
      expect(after.mcp.servers.files?.disabled).toBe(true)

      const locate = provider.locate
      if (locate === undefined) throw new Error("locate is missing")
      const lines = await locate(mcpIo, "opencode-workspace-jsonc", "files")
      expect(lines).not.toBeNull()
      const [start, end] = lines ?? [0, 0]
      expect(switched.split("\n").slice(start - 1, end).join("\n")).toContain('"files"')

      await provider.uninstall(mcpIo, "opencode-workspace-jsonc", "files")
      const removed = await text(file)
      expect(removed).toContain("// keep this comment")
      expect(removed).toContain('"existing"')
      expect(removed).not.toContain('"files"')
      expect(file.startsWith(folder)).toBe(true)
    })

    it("writes to each of the six physical files independently", async () => {
      const { folder, userHome, mcpIo } = await roots()
      const provider = createOpenCodeMcp(host.mcpTools)
      const expected: Record<string, string> = {
        "opencode-global-jsonc": path.join(userHome, ".config/opencode/opencode.jsonc"),
        "opencode-global-json": path.join(userHome, ".config/opencode/opencode.json"),
        "opencode-workspace-jsonc": path.join(folder, "opencode.jsonc"),
        "opencode-workspace-json": path.join(folder, "opencode.json"),
        "opencode-dotdir-jsonc": path.join(folder, ".opencode/opencode.jsonc"),
        "opencode-dotdir-json": path.join(folder, ".opencode/opencode.json"),
      }

      for (const place of provider.places) {
        await provider.install(mcpIo, place.id, `server-${place.id}`, local)
      }

      for (const place of provider.places) {
        const file = expected[place.id]
        if (file === undefined) throw new Error(`no expected path for ${place.id}`)
        const document = host.mcpTools.parseJsonc(await text(file)) as {
          mcp: { servers: Record<string, unknown> }
        }
        expect(Object.keys(document.mcp.servers)).toEqual([`server-${place.id}`])
      }
    })

    it.each([
      ["a flat server", `{ "mcp": { "files": { "command": "node" } } }`],
      [
        "a mixed file",
        `{ "mcp": { "flat": { "command": "node" }, "servers": { "files": { "type": "local", "command": ["node"] } } } }`,
      ],
      [
        "an old enabled switch",
        `{ "mcp": { "servers": { "files": { "type": "local", "command": ["node"], "enabled": true } } } }`,
      ],
      [
        "a numeric timeout",
        `{ "mcp": { "servers": { "files": { "type": "local", "command": ["node"], "timeout": 5 } } } }`,
      ],
    ])("refuses %s and leaves the file byte for byte", async (_what, document) => {
      const { folder, mcpIo } = await roots()
      const file = path.join(folder, "opencode.json")
      await put(file, document)
      const provider = createOpenCodeMcp(host.mcpTools)

      await expect(provider.install(mcpIo, "opencode-workspace-json", "files", local)).rejects.toMatchObject(
        { key: "opencode.error.v2Only" }
      )
      expect(await text(file)).toBe(document)
    })

    it("does not mistake a server named servers for the container", async () => {
      const { folder, mcpIo } = await roots()
      const file = path.join(folder, "opencode.json")
      await put(
        file,
        `{ "mcp": { "servers": { "servers": { "type": "local", "command": ["node"] } } } }`
      )
      const provider = createOpenCodeMcp(host.mcpTools)

      await provider.install(mcpIo, "opencode-workspace-json", "servers", local)

      const document = host.mcpTools.parseJsonc(await text(file)) as {
        mcp: { servers: { servers: Record<string, unknown> } }
      }
      expect(document.mcp.servers.servers).toEqual({
        type: "local",
        command: ["node", "server.js", "--root", "a b"],
        environment: { TOKEN: "kept" },
      })
    })

    it("refuses SSE without creating a file", async () => {
      const { folder, mcpIo } = await roots()
      const provider = createOpenCodeMcp(host.mcpTools)

      await expect(
        provider.install(mcpIo, "opencode-workspace-jsonc", "sse", {
          transport: "sse",
          url: "https://example.test/sse",
          headers: {},
        })
      ).rejects.toMatchObject({ key: "opencode.error.sse" })
      expect(existsSync(path.join(folder, "opencode.jsonc"))).toBe(false)
    })
  })

  describe("prompt files", () => {
    const prompt = {
      name: "Code Review",
      description: '第一行\n第二行: "quoted"',
      prompt: "Review the diff.\nUse $ARGUMENTS and $1.",
    }

    it("writes commands and agents to the real workspace and user roots", async () => {
      const { folder, userHome, promptIo } = await roots()
      const provider = createOpenCodePrompts(() => null, host.promptTools)

      await provider.install(promptIo, "opencode", prompt, "commands")
      await provider.install(promptIo, "opencode-global", prompt, "agent")

      const commandFile = path.join(folder, ".opencode/commands/code-review.md")
      const agentFile = path.join(userHome, ".config/opencode/agents/code-review.md")
      const command = await text(commandFile)
      expect(command.startsWith('---\ndescription: "第一行 第二行: \\"quoted\\""\n---\n\n')).toBe(
        true
      )
      expect(command).toContain("<!-- context-hub:code-review -->")
      expect(command).toContain("Use $ARGUMENTS and $1.")
      const agent = await text(agentFile)
      expect(agent).toContain("mode: subagent")
      expect(await provider.held(promptIo, "opencode", prompt)).toEqual({ commands: true })
      expect(await provider.held(promptIo, "opencode-global", prompt)).toEqual({ agent: true })

      await provider.remove(promptIo, "opencode", prompt, "commands")
      await provider.remove(promptIo, "opencode-global", prompt, "agent")
      expect(existsSync(commandFile)).toBe(false)
      expect(existsSync(agentFile)).toBe(false)
      expect(commandFile.startsWith(folder)).toBe(true)
      expect(agentFile.startsWith(userHome)).toBe(true)
    })

    it("adds and removes one section of the real AGENTS.md", async () => {
      const { userHome, promptIo } = await roots()
      const file = path.join(userHome, ".config/opencode/AGENTS.md")
      await put(file, "# House rules\n\nUse tabs.\n")
      const provider = createOpenCodePrompts(() => null, host.promptTools)

      await provider.install(promptIo, "opencode-global", prompt, "instructions")
      const withSection = await text(file)
      expect(withSection).toContain("Use tabs.")
      expect(withSection).toContain("<!-- context-hub:code-review -->")

      await provider.remove(promptIo, "opencode-global", prompt, "instructions")
      const without = await text(file)
      expect(without).toContain("Use tabs.")
      expect(without).not.toContain("context-hub")
    })

    it("refuses a hand-written command and a broken section", async () => {
      const { folder, userHome, promptIo } = await roots()
      const provider = createOpenCodePrompts(() => null, host.promptTools)
      const handWritten = path.join(folder, ".opencode/commands/code-review.md")
      await put(handWritten, '---\ndescription: "Mine"\n---\n\nMy own command.\n')

      await expect(provider.install(promptIo, "opencode", prompt, "commands")).rejects.toMatchObject({
        key: "opencode.error.handwritten",
      })
      expect(await text(handWritten)).toBe('---\ndescription: "Mine"\n---\n\nMy own command.\n')

      const agents = path.join(userHome, ".config/opencode/AGENTS.md")
      const broken = "# Mine\n<!-- context-hub:code-review -->\nno close\n"
      await put(agents, broken)
      await expect(
        provider.install(promptIo, "opencode-global", prompt, "instructions")
      ).rejects.toMatchObject({ key: "opencode.error.sectionBroken" })
      expect(await text(agents)).toBe(broken)
    })
  })

  describe("skills places", () => {
    it("reads three physical places once each and keeps same-name rows apart", async () => {
      const { home, folder, userHome, files } = await roots()
      await put(
        path.join(folder, ".agents/skills/shared-one/SKILL.md"),
        '---\nname: shared-one\ndescription: shared\n---\n'
      )
      await put(
        path.join(folder, ".opencode/skills/project-one/SKILL.md"),
        '---\nname: project-one\ndescription: project\n---\n'
      )
      await put(
        path.join(userHome, ".config/opencode/skills/global-one/SKILL.md"),
        '---\nname: global-one\ndescription: global\n---\n'
      )
      await put(
        path.join(folder, ".opencode/skills/dupe/SKILL.md"),
        '---\nname: dupe\ndescription: workspace copy\n---\n'
      )
      await put(
        path.join(userHome, ".config/opencode/skills/dupe/SKILL.md"),
        '---\nname: dupe\ndescription: global copy\n---\n'
      )
      await put(
        path.join(folder, ".claude/skills/claude-one/SKILL.md"),
        '---\nname: claude-one\ndescription: claude\n---\n'
      )
      await put(
        path.join(userHome, ".claude/skills/claude-one/SKILL.md"),
        '---\nname: claude-one\ndescription: claude global\n---\n'
      )

      const shared: SkillProvider = {
        id: "hub.skill.catalog",
        shared: true,
        places: [
          {
            id: "workspace",
            labelKey: "skills.tab.workspace",
            icon: () => null,
            scope: "workspace",
            dir: ".agents/skills",
            order: 10,
          },
        ],
      }
      const claude: SkillProvider = {
        id: "hub.target.claude-code",
        places: [
          {
            id: "claude-code",
            labelKey: "claudeCode.tab",
            icon: () => null,
            scope: "workspace",
            dir: ".claude/skills",
            order: 20,
          },
          {
            id: "claude-code-global",
            labelKey: "claudeCode.tab",
            icon: () => null,
            scope: "global",
            dir: ".claude/skills",
            order: 20,
          },
        ],
      }
      const opencode = openCodeProvider()
      const places = host.readablePlaces(
        [shared, opencode, claude],
        ["hub.target.opencode", "hub.target.claude-code"]
      )

      const keys = places.map((place) => host.skillPlaceKey(place))
      expect(new Set(keys).size).toBe(keys.length)
      expect(places.map((place) => `${place.scope}:${place.dir}`)).toEqual([
        "workspace:.agents/skills",
        "workspace:.opencode/skills",
        "global:.config/opencode/skills",
        "workspace:.claude/skills",
        "global:.claude/skills",
      ])
      expect(host.placePath(opencode.places[0]!)).toBe(".opencode/skills")
      expect(host.placePath(opencode.places[1]!)).toBe("~/.config/opencode/skills")
      expect(places.some((place) => place.scope === "global" && place.dir === ".agents/skills")).toBe(
        false
      )

      const store = await host.createFsSkillStore({ home, folder, userHome })
      const counts = []
      for (const place of places) {
        const view = await store.placeSkills({ scope: place.scope, dir: place.dir })
        counts.push(view?.skills.map((skill) => skill.name) ?? [])
      }
      expect(counts).toEqual([
        ["shared-one"],
        ["dupe", "project-one"],
        ["dupe", "global-one"],
        ["claude-one"],
        ["claude-one"],
      ])

      /* The same name lives in two physical places; taking it out of one leaves
         the other's row and directory untouched. */
      await store.deleteInPlace("dupe", { scope: "workspace", dir: ".opencode/skills" })
      const workspace = await store.placeSkills({ scope: "workspace", dir: ".opencode/skills" })
      const global = await store.placeSkills({ scope: "global", dir: ".config/opencode/skills" })
      expect(workspace?.skills.map((skill) => skill.name)).toEqual(["project-one"])
      expect(global?.skills.map((skill) => skill.name)).toEqual(["dupe", "global-one"])
      expect(existsSync(path.join(userHome, ".config/opencode/skills/dupe/SKILL.md"))).toBe(true)

      /* Every path the store reported sits under the temporary root it belongs to. */
      expect(workspace?.root.startsWith(folder)).toBe(true)
      expect(global?.root.startsWith(userHome)).toBe(true)
      expect(files.workspace && (await files.workspace()) === folder).toBe(true)
    })
  })
})
