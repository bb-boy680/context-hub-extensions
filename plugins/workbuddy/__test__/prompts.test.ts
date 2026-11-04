/**
 * Where WorkBuddy takes a prompt: command and agent files, plus the machine-wide
 * AGENTS.md section.
 *
 * The hub's own naming and section rules are checked in the host checkout; this
 * stands them in with an equivalent so the provider's decisions — frontmatter,
 * ownership marker, broken-section refusal — are the thing under test.
 */
import { describe, expect, it } from "vitest"

import type {
  Prompt,
  PromptIo,
  PromptRef,
  PromptTools,
} from "../src/contracts.ts"
import { createWorkBuddyPrompts } from "../src/prompts.ts"

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
    (body.split("\n").find((line) => line.trim() !== "") ?? "")
      .replace(/^#+\s*/, "")
      .trim(),
  commandFile: ({ name, description, body, frontmatter }) => {
    const text = body.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\s+$/, "")
    if (!frontmatter) return text === "" ? "" : `${text}\n`
    const desc = description.trim() || (text.split("\n").find((line) => line.trim() !== "") ?? "").replace(/^#+\s*/, "").trim()
    const scalar = (value: string) => JSON.stringify(value.replace(/\s+/g, " ").trim())
    return `---\nname: ${scalar(name)}\n${desc ? `description: ${scalar(desc)}\n` : ""}---\n\n${text}\n`
  },
  withSection,
  withoutSection,
  PromptError: TestPromptError,
}

const provider = createWorkBuddyPrompts(() => null, promptTools)

const prompt: Prompt = {
  name: "Code Review",
  description: "Reads the diff and says what it changes",
  prompt: "Review the diff.\nReport what it changes.",
}

const key = (ref: PromptRef) => `${ref.scope}:${ref.file}`
const WORKSPACE_COMMAND = "workspace:.codebuddy/commands/code-review.md"
const GLOBAL_COMMAND = "global:.codebuddy/commands/code-review.md"
const GLOBAL_AGENTS = "global:.codebuddy/CODEBUDDY.md"

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

describe("the places WorkBuddy offers", () => {
  it("puts commands and agents in both scopes, and instructions only globally", () => {
    const global = provider.places.find((place) => place.id === "workbuddy-coding-global")
    expect(global?.where).toBe("~/.codebuddy")
    expect(global?.scope).toBe("global")
    expect(global?.forms.map((form) => form.id)).toEqual([
      "commands",
      "instructions",
    ])

    const workspace = provider.places.find((place) => place.id === "workbuddy-coding")
    expect(workspace?.where).toBe(".codebuddy")
    expect(workspace?.scope).toBe("workspace")
    expect(workspace?.forms.map((form) => form.id)).toEqual(["commands"])
  })
})

describe("a command file", () => {
  it("writes frontmatter with a description and no name", async () => {
    const { io, map } = memory()
    await provider.install(io, "workbuddy-coding", prompt, "commands")

    const text = map.get(WORKSPACE_COMMAND) ?? ""
    expect(text.startsWith('---\nname: "Code Review"\ndescription: "Reads the diff and says what it changes"\n---\n\n')).toBe(
      true
    )
    expect(text).toContain("<!-- context-hub:code-review -->")
    expect(text).toContain("Review the diff.\nReport what it changes.\n")
    expect(await provider.held(io, "workbuddy-coding", prompt)).toEqual({ commands: true })
  })

  it("writes the machine-wide command under the global root", async () => {
    const { io, map } = memory()
    await provider.install(io, "workbuddy-coding-global", prompt, "commands")

    expect(map.has(GLOBAL_COMMAND)).toBe(true)
    expect(map.has(WORKSPACE_COMMAND)).toBe(false)
  })

  it("updates the same file instead of adding a second one", async () => {
    const { io, map } = memory()
    await provider.install(io, "workbuddy-coding", prompt, "commands")
    await provider.install(io, "workbuddy-coding", { ...prompt, prompt: "Review it twice." }, "commands")

    expect(map.size).toBe(1)
    const text = map.get(WORKSPACE_COMMAND) ?? ""
    expect(text.split("<!-- context-hub:code-review -->")).toHaveLength(2)
    expect(text).toContain("Review it twice.")
  })

  it("keeps a description on one escaped YAML line", async () => {
    const { io, map } = memory()
    await provider.install(
      io,
      "workbuddy-coding",
      {
        name: "Code Review",
        description: '第一行\n第二行: "quoted"',
        prompt: "Review.",
      },
      "commands"
    )

    const text = map.get(WORKSPACE_COMMAND) ?? ""
    const lines = text.split("\n").filter((line) => line.startsWith("description:"))
    expect(lines).toEqual(['description: "第一行 第二行: \\"quoted\\""'])
  })

  it("derives the description from the body, then from the name", async () => {
    const { io, map } = memory()
    await provider.install(
      io,
      "workbuddy-coding",
      { name: "Fallback", description: "", prompt: "## Do the thing\nmore" },
      "commands"
    )
    expect(map.get("workspace:.codebuddy/commands/fallback.md")).toContain(
      'description: "Do the thing"'
    )

    const second = memory()
    await provider.install(
      second.io,
      "workbuddy-coding",
      { name: "Only Name", description: "", prompt: "" },
      "commands"
    )
    expect(second.map.get("workspace:.codebuddy/commands/only-name.md")).toContain(
      'name: "Only Name"'
    )
  })

  it("keeps argument and shell literals in the body", async () => {
    const { io, map } = memory()
    await provider.install(
      io,
      "workbuddy-coding",
      { ...prompt, prompt: "Use $ARGUMENTS and $1, then $(date)." },
      "commands"
    )
    expect(map.get(WORKSPACE_COMMAND)).toContain("Use $ARGUMENTS and $1, then $(date).")
  })
})

describe("a file this hub did not write", () => {
  const handwritten = '---\ndescription: "Mine"\n---\n\nMy own command.\n'

  it("is never overwritten or removed", async () => {
    const { io, map } = memory({ [WORKSPACE_COMMAND]: handwritten })
    await expect(provider.install(io, "workbuddy-coding", prompt, "commands")).rejects.toMatchObject({
      key: "workbuddy.error.handwritten",
      params: { file: ".codebuddy/commands/code-review.md" },
    })
    expect(map.get(WORKSPACE_COMMAND)).toBe(handwritten)
    expect(await provider.held(io, "workbuddy-coding", prompt)).toEqual({})
    expect(await provider.remove(io, "workbuddy-coding", prompt, "commands")).toBe(false)
  })

  it("is not claimed when the marker is not the first body line", async () => {
    const text = `---\ndescription: "Mine"\n---\n\nSome prose.\n<!-- context-hub:code-review -->\n`
    const { io, map } = memory({ [WORKSPACE_COMMAND]: text })
    expect(await provider.held(io, "workbuddy-coding", prompt)).toEqual({})
    await expect(provider.install(io, "workbuddy-coding", prompt, "commands")).rejects.toMatchObject({
      key: "workbuddy.error.handwritten",
    })
    expect(map.get(WORKSPACE_COMMAND)).toBe(text)
  })

  it("is not claimed when the frontmatter has no closing fence", async () => {
    const text = '---\ndescription: "Mine"\n<!-- context-hub:code-review -->\n'
    const { io } = memory({ [WORKSPACE_COMMAND]: text })
    expect(await provider.held(io, "workbuddy-coding", prompt)).toEqual({})
  })
})

describe("removing a generated file", () => {
  it("takes back only a file this hub wrote", async () => {
    const { io, map } = memory()
    await provider.install(io, "workbuddy-coding", prompt, "commands")
    expect(await provider.remove(io, "workbuddy-coding", prompt, "commands")).toBe(true)
    expect(map.has(WORKSPACE_COMMAND)).toBe(false)
    expect(await provider.remove(io, "workbuddy-coding", prompt, "commands")).toBe(false)
  })
})

describe("the machine-wide instruction file", () => {
  it("adds one marked section and keeps the person's own text", async () => {
    const { io, map } = memory({ [GLOBAL_AGENTS]: "# House rules\n\nUse tabs.\n" })
    await provider.install(io, "workbuddy-coding-global", prompt, "instructions")

    const text = map.get(GLOBAL_AGENTS) ?? ""
    expect(text).toContain("Use tabs.")
    expect(text).toContain("<!-- context-hub:code-review -->")
    expect(await provider.held(io, "workbuddy-coding-global", prompt)).toEqual({ instructions: true })
  })

  it("leaves one section on a second click", async () => {
    const { io, map } = memory()
    await provider.install(io, "workbuddy-coding-global", prompt, "instructions")
    await provider.install(io, "workbuddy-coding-global", prompt, "instructions")
    expect((map.get(GLOBAL_AGENTS) ?? "").split("<!-- context-hub:code-review -->")).toHaveLength(2)
  })

  it("takes the section back, and deletes a file that held only that", async () => {
    const { io, map } = memory()
    await provider.install(io, "workbuddy-coding-global", prompt, "instructions")
    expect(await provider.remove(io, "workbuddy-coding-global", prompt, "instructions")).toBe(true)
    expect(map.has(GLOBAL_AGENTS)).toBe(false)
    expect(await provider.remove(io, "workbuddy-coding-global", prompt, "instructions")).toBe(false)
  })

  it.each([
    ["an opening marker with no close", "<!-- context-hub:code-review -->\ntext\n"],
    ["a closing marker with no open", "text\n<!-- /context-hub:code-review -->\n"],
    ["a close before an open", "<!-- /context-hub:code-review -->\n<!-- context-hub:code-review -->\ntext\n"],
    ["duplicate opens", "<!-- context-hub:code-review -->\n<!-- context-hub:code-review -->\n<!-- /context-hub:code-review -->\n"],
  ])("refuses a file with %s", async (_what, text) => {
    const { io, map } = memory({ [GLOBAL_AGENTS]: text })

    await expect(
      provider.install(io, "workbuddy-coding-global", prompt, "instructions")
    ).rejects.toMatchObject({ key: "workbuddy.error.sectionBroken" })
    await expect(
      provider.remove(io, "workbuddy-coding-global", prompt, "instructions")
    ).rejects.toMatchObject({ key: "workbuddy.error.sectionBroken" })
    expect(map.get(GLOBAL_AGENTS)).toBe(text)
  })
})

describe("a request this place cannot answer", () => {
  it("names a place it does not own", async () => {
    const { io } = memory()
    await expect(provider.held(io, "elsewhere", prompt)).rejects.toMatchObject({
      key: "workbuddy.error.unknownPlace",
    })
  })

  it("refuses the project AGENTS.md form, which the workspace place does not offer", async () => {
    const { io } = memory()
    await expect(provider.install(io, "workbuddy-coding", prompt, "instructions")).rejects.toMatchObject({
      key: "workbuddy.error.unknownForm",
    })
  })

  it("refuses a form it does not know", async () => {
    const { io } = memory()
    await expect(provider.install(io, "workbuddy-coding", prompt, "rule")).rejects.toMatchObject({
      key: "workbuddy.error.unknownForm",
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
    await expect(provider.held(io, "workbuddy-coding", prompt)).rejects.toMatchObject({
      key: "workbuddy.error.refused",
    })
  })
})
