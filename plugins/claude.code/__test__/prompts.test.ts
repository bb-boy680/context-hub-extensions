/**
 * Where Claude Code takes a prompt, and what the provider puts in each file.
 *
 * The hub's own rules for names, frontmatter and marked sections are checked in
 * the hub; this stands in the three of them with a small equivalent so the
 * provider's decisions — which file, which form, which held key — are the thing
 * under test.
 */
import { describe, expect, it } from "vitest"

import type {
  Prompt,
  PromptIo,
  PromptRef,
  PromptScope,
  PromptTools,
} from "../src/contracts.ts"
import { createClaudeCodePrompts } from "../src/prompts.ts"

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

function slugOf(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-")
}

function commandFile(input: {
  name: string
  description: string
  body: string
  frontmatter: boolean
}): string {
  if (!input.frontmatter) return `${input.body}\n`
  return `---\nname: ${input.name}\n${input.description === "" ? "" : `description: ${input.description}\n`}---\n\n${input.body}\n`
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

const tools: PromptTools = {
  slugOf,
  describeBody: (body) => body.split("\n").find((line) => line.trim() !== "") ?? "",
  commandFile,
  withSection,
  withoutSection,
  PromptError: TestPromptError,
}

/** An in-memory client-file port. */
function memory(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed))
  const keyOf = (ref: PromptRef) => `${ref.scope}:${ref.file}`
  const files = {
    read: async (ref: PromptRef) => map.get(keyOf(ref)) ?? null,
    write: async (ref: PromptRef, text: string) => {
      map.set(keyOf(ref), text)
    },
    remove: async (ref: PromptRef) => {
      map.delete(keyOf(ref))
    },
    workspace: async () => "/project",
  }
  const io: PromptIo = { files, workspace: () => files.workspace() }
  return { map, io, keyOf }
}

const prompt: Prompt = {
  name: "Code Review",
  description: "Reads the diff and says what it changes",
  prompt: "Review the diff.\nReport what it changes.",
}

const provider = createClaudeCodePrompts(() => null, tools)

const file = (scope: PromptScope, path: string) => `${scope}:${path}`

describe("the places Claude Code offers", () => {
  it("writes commands, rules and agents in the workspace, but no memory file", () => {
    const [workspace] = provider.places
    expect(workspace?.id).toBe("claude-code")
    expect(workspace?.where).toBe(".claude")
    expect(workspace?.forms.map((form) => form.id)).toEqual(["commands", "rule", "agent"])
  })

  it("adds the machine-wide memory file to the global place", () => {
    const global = provider.places.find((place) => place.id === "claude-code-global")
    expect(global?.where).toBe("~/.claude")
    const instructions = global?.forms.find((form) => form.id === "instructions")
    expect(instructions?.labelKey).toBe("claudeCode.menu.documents")
    expect(instructions?.options?.map((option) => option.id)).toEqual(["claude"])
    expect(instructions?.options?.[0]?.labelKey).toBe("claudeCode.menu.instructions")
  })
})

describe("writing one prompt out", () => {
  it("writes a command with frontmatter", async () => {
    const { io } = memory()
    await provider.install(io, "claude-code", prompt, "commands")
    expect(await io.files.read({ scope: "workspace", file: ".claude/commands/code-review.md" })).toMatch(
      /^---\nname: Code Review/
    )
  })

  it("writes a rule as the prompt itself", async () => {
    const { io, map } = memory()
    await provider.install(io, "claude-code", prompt, "rule")
    expect(map.get(file("workspace", ".claude/rules/code-review.md"))).not.toContain("---")
  })

  it("writes an agents file with frontmatter", async () => {
    const { io, map } = memory()
    await provider.install(io, "claude-code", prompt, "agent")
    expect(map.get(file("workspace", ".claude/agents/code-review.md"))).toMatch(/^---\nname:/)
  })

  it("reports the three files it has", async () => {
    const { io } = memory()
    await provider.install(io, "claude-code", prompt, "commands")
    await provider.install(io, "claude-code", prompt, "rule")
    await provider.install(io, "claude-code", prompt, "agent")
    expect(await provider.held(io, "claude-code", prompt)).toEqual({
      commands: true,
      rule: true,
      agent: true,
    })
  })
})

describe("the machine-wide memory file", () => {
  it("adds a marked section and keeps the person's own text", async () => {
    const { io, map } = memory({
      [file("global", ".claude/CLAUDE.md")]: "# House rules\n\nUse tabs.\n",
    })
    await provider.install(io, "claude-code-global", prompt, "instructions", "claude")
    const text = map.get(file("global", ".claude/CLAUDE.md")) ?? ""
    expect(text).toContain("Use tabs.")
    expect(text).toContain("<!-- context-hub:code-review -->")
    expect(await provider.held(io, "claude-code-global", prompt)).toEqual({
      "instructions:claude": true,
    })
  })

  it("leaves one section on a second click", async () => {
    const { io, map } = memory()
    await provider.install(io, "claude-code-global", prompt, "instructions", "claude")
    await provider.install(io, "claude-code-global", prompt, "instructions", "claude")
    const text = map.get(file("global", ".claude/CLAUDE.md")) ?? ""
    expect(text.split("<!-- context-hub:code-review -->")).toHaveLength(2)
  })

  it("takes the section back and keeps the rest", async () => {
    const { io, map } = memory({
      [file("global", ".claude/CLAUDE.md")]: "# House rules\n\nUse tabs.\n",
    })
    await provider.install(io, "claude-code-global", prompt, "instructions", "claude")
    expect(await provider.remove(io, "claude-code-global", prompt, "instructions", "claude")).toBe(
      true
    )
    const text = map.get(file("global", ".claude/CLAUDE.md")) ?? ""
    expect(text).toContain("Use tabs.")
    expect(text).not.toContain("context-hub:code-review")
  })

  it("deletes a file that held nothing but the section", async () => {
    const { io, map } = memory()
    await provider.install(io, "claude-code-global", prompt, "instructions", "claude")
    expect(await provider.remove(io, "claude-code-global", prompt, "instructions", "claude")).toBe(
      true
    )
    expect(map.has(file("global", ".claude/CLAUDE.md"))).toBe(false)
  })
})

describe("a request this place cannot answer", () => {
  it("names a place it does not own", async () => {
    const { io } = memory()
    await expect(provider.held(io, "elsewhere", prompt)).rejects.toMatchObject({
      key: "claudeCode.error.unknownPlace",
    })
  })

  it("names an action it does not offer", async () => {
    const { io } = memory()
    await expect(
      provider.install(io, "claude-code", prompt, "instructions", "claude")
    ).rejects.toMatchObject({ key: "claudeCode.error.unknownForm" })
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
    await expect(provider.held(io, "claude-code", prompt)).rejects.toMatchObject({
      key: "claudeCode.error.refused",
    })
  })
})
