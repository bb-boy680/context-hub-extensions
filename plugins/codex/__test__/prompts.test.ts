/**
 * Where Codex takes a prompt: the machine-wide instruction file and agent roles.
 *
 * The hub's own section and name rules are checked there; this stands them in
 * with a small equivalent so the provider's decisions — override precedence,
 * TOML content, ownership marker — are the thing under test.
 */
import { describe, expect, it } from "vitest"

import type {
  McpTools,
  Prompt,
  PromptIo,
  PromptRef,
  PromptTools,
} from "../src/contracts.ts"
import { createCodexPrompts } from "../src/prompts.ts"

class TestPromptError extends Error {
  readonly key: string
  readonly params: Record<string, string> | undefined

  constructor(key: string, params?: Record<string, string>, detail?: string) {
    super(detail ?? key)
    this.name = "TestPromptError"
    this.key = key
    this.params = params
  }
}

function markers(slug: string) {
  return {
    open: `<!-- context-hub:${slug} -->`,
    close: `<!-- /context-hub:${slug} -->`,
  }
}

function withSection(
  existing: string | null,
  input: { slug: string; title: string; body: string }
): string {
  const { open, close } = markers(input.slug)
  const block = `${open}\n## ${input.title}\n\n${input.body.trim()}\n${close}`
  if (existing === null) return `${block}\n`
  const start = existing.indexOf(open)
  if (start < 0) return `${existing.replace(/\s+$/, "")}\n\n${block}\n`
  const end = existing.indexOf(close, start)
  const head = existing.slice(0, start)
  const tail = end < 0 ? "" : existing.slice(end + close.length).replace(/^\n+/, "")
  return tail === "" ? `${head}${block}\n` : `${head}${block}\n\n${tail}`
}

function withoutSection(existing: string, slug: string): string | null {
  const { open, close } = markers(slug)
  const start = existing.indexOf(open)
  if (start < 0) return null
  const end = existing.indexOf(close, start)
  const head = existing.slice(0, start).replace(/\s+$/, "")
  const tail = end < 0 ? "" : existing.slice(end + close.length).replace(/^\n+/, "")
  const next = head === "" ? tail : tail === "" ? head : `${head}\n\n${tail}`
  return next === "" ? "" : `${next.replace(/\s+$/, "")}\n`
}

const promptTools: PromptTools = {
  slugOf: (name) => name.trim().toLowerCase().replace(/\s+/g, "-"),
  describeBody: (body) =>
    (body.split("\n").find((line) => line.trim() !== "") ?? "").replace(/^#+\s*/, "").trim(),
  commandFile: () => "",
  withSection,
  withoutSection,
  PromptError: TestPromptError,
}

/** The one TOML rule this provider leans on; the real escapes are tested in the hub. */
const mcp = { writeTomlString: (value: string) => JSON.stringify(value) } as unknown as McpTools

const provider = createCodexPrompts(promptTools, mcp, () => null)

const prompt: Prompt = {
  name: "Code Review",
  description: "Reads the diff and says what it changes",
  prompt: "Review the diff.\nReport what it changes.",
}

const key = (ref: PromptRef) => `${ref.scope}:${ref.file}`
const AGENTS = key({ scope: "global", file: ".codex/AGENTS.md" })
const OVERRIDE = key({ scope: "global", file: ".codex/AGENTS.override.md" })
const AGENT = key({ scope: "workspace", file: ".codex/agents/code-review.toml" })

/** An in-memory client-file port. */
function memory(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed))
  const files = {
    read: async (ref: PromptRef) => map.get(key(ref)) ?? null,
    write: async (ref: PromptRef, text: string) => {
      map.set(key(ref), text)
    },
    remove: async (ref: PromptRef) => {
      map.delete(key(ref))
    },
    workspace: async () => "/project",
  }
  const io: PromptIo = { files, workspace: () => files.workspace() }
  return { map, io }
}

describe("the places Codex offers", () => {
  it("puts instructions and agents in the machine-wide place", () => {
    const global = provider.places.find((place) => place.id === "codex-global")
    expect(global?.where).toBe("~/.codex")
    expect(global?.scope).toBe("global")
    expect(global?.forms.map((form) => form.id)).toEqual(["instructions", "agent"])
  })

  it("puts only agents in a project, because AGENTS.md is the hub's shared place", () => {
    const workspace = provider.places.find((place) => place.id === "codex")
    expect(workspace?.where).toBe(".codex")
    expect(workspace?.scope).toBe("workspace")
    expect(workspace?.forms.map((form) => form.id)).toEqual(["agent"])
  })
})

describe("the machine-wide instruction file", () => {
  it("adds a marked section and keeps the person's own text", async () => {
    const { io, map } = memory({ [AGENTS]: "# House rules\n\nUse tabs.\n" })
    await provider.install(io, "codex-global", prompt, "instructions")
    const text = map.get(AGENTS) ?? ""
    expect(text).toContain("Use tabs.")
    expect(text).toContain("<!-- context-hub:code-review -->")
    expect(await provider.held(io, "codex-global", prompt)).toEqual({ instructions: true })
  })

  it("leaves one section on a second click", async () => {
    const { io, map } = memory()
    await provider.install(io, "codex-global", prompt, "instructions")
    await provider.install(io, "codex-global", prompt, "instructions")
    expect((map.get(AGENTS) ?? "").split("<!-- context-hub:code-review -->")).toHaveLength(2)
  })

  it("takes the section back, and deletes a file that held only that", async () => {
    const { io, map } = memory()
    await provider.install(io, "codex-global", prompt, "instructions")
    expect(await provider.remove(io, "codex-global", prompt, "instructions")).toBe(true)
    expect(map.has(AGENTS)).toBe(false)
    expect(await provider.remove(io, "codex-global", prompt, "instructions")).toBe(false)
  })
})

describe("Codex's override file", () => {
  it("hides the section and refuses to write while the override is non-empty", async () => {
    const { io, map } = memory({ [OVERRIDE]: "OVERRIDE BODY\n" })
    expect(await provider.held(io, "codex-global", prompt)).toEqual({})
    await expect(provider.install(io, "codex-global", prompt, "instructions")).rejects.toMatchObject(
      { key: "codex.error.override" }
    )
    expect(map.has(AGENTS)).toBe(false)
  })

  it.each([
    ["empty", ""],
    ["whitespace", "  \n\n"],
  ])("writes when the override is %s", async (_what, text) => {
    const { io, map } = memory({ [OVERRIDE]: text })
    await provider.install(io, "codex-global", prompt, "instructions")
    expect(map.get(AGENTS)).toContain("<!-- context-hub:code-review -->")
  })

  it("does not check the override when taking a section back", async () => {
    const { io, map } = memory()
    await provider.install(io, "codex-global", prompt, "instructions")
    map.set(OVERRIDE, "OVERRIDE BODY\n")
    expect(await provider.remove(io, "codex-global", prompt, "instructions")).toBe(true)
    expect(map.has(AGENTS)).toBe(false)
  })
})

describe("an agent role file", () => {
  it("writes one TOML file named after the prompt, with the hub marker", async () => {
    const { io, map } = memory()
    await provider.install(io, "codex", prompt, "agent")
    const text = map.get(AGENT) ?? ""
    expect(text.startsWith("# context-hub:code-review\n")).toBe(true)
    expect(text).toContain('name = "Code Review"')
    expect(text).toContain('description = "Reads the diff and says what it changes"')
    expect(text).toContain('developer_instructions = "Review the diff.\\nReport what it changes."')
    expect(await provider.held(io, "codex", prompt)).toEqual({ agent: true })
  })

  it("writes the global role under the machine-wide root", async () => {
    const { io, map } = memory()
    await provider.install(io, "codex-global", prompt, "agent")
    expect(map.has(key({ scope: "global", file: ".codex/agents/code-review.toml" }))).toBe(true)
  })

  it("falls back to the body's first line when the prompt has no description", async () => {
    const { io, map } = memory()
    await provider.install(
      io,
      "codex",
      { ...prompt, description: "", prompt: "## Do the thing\nmore" },
      "agent"
    )
    expect(map.get(AGENT)).toContain('description = "Do the thing"')
  })

  it("overwrites a role file it wrote, so an edited prompt can update it", async () => {
    const { io, map } = memory()
    await provider.install(io, "codex", prompt, "agent")
    await provider.install(io, "codex", { ...prompt, prompt: "Review it twice." }, "agent")
    expect(map.get(AGENT)).toContain("Review it twice.")
  })

  it("leaves a hand-written role file alone", async () => {
    const { io, map } = memory({ [AGENT]: 'name = "Mine"\n' })
    await expect(provider.install(io, "codex", prompt, "agent")).rejects.toMatchObject({
      key: "codex.error.agentExists",
    })
    expect(map.get(AGENT)).toBe('name = "Mine"\n')
    expect(await provider.held(io, "codex", prompt)).toEqual({})
    expect(await provider.remove(io, "codex", prompt, "agent")).toBe(false)
  })
})

describe("a request this place cannot answer", () => {
  it("names a place it does not own", async () => {
    const { io } = memory()
    await expect(provider.held(io, "elsewhere", prompt)).rejects.toMatchObject({
      key: "codex.error.unknownPlace",
    })
  })

  it("refuses the project's AGENTS.md form, which it does not offer", async () => {
    const { io } = memory()
    await expect(provider.install(io, "codex", prompt, "instructions")).rejects.toMatchObject({
      key: "codex.error.unknownForm",
    })
  })

  it("wraps a port that refuses the file", async () => {
    const io: PromptIo = {
      files: {
        read: async () => {
          throw new Error("EACCES")
        },
        write: async () => undefined,
        remove: async () => undefined,
        workspace: async () => "/project",
      },
      workspace: async () => "/project",
    }
    await expect(provider.held(io, "codex", prompt)).rejects.toMatchObject({
      key: "codex.error.refused",
    })
  })
})
