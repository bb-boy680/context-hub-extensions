import { describe, expect, it } from "vitest"
import type { PromptIo, PromptTools } from "../src/contracts.ts"
import { createDeepSeekHarnessPrompts } from "../src/prompts.ts"

class TestError extends Error {
  constructor(public key: string, public params?: Record<string, string>, detail?: string) {
    super(detail ?? key)
  }
}
const tools: PromptTools = {
  slugOf: (name) => name.toLowerCase().replaceAll(" ", "-"),
  withSection: (text, { slug, title, body }) => `${text ?? ""}<!-- context-hub:${slug} -->\n## ${title}\n${body}\n<!-- /context-hub:${slug} -->\n`,
  withoutSection: (text, slug) => text.includes(`<!-- context-hub:${slug} -->`) ? "" : null,
  PromptError: TestError,
}
const prompt = { name: "Code Review", description: "Review", prompt: "Review the diff." }
const provider = createDeepSeekHarnessPrompts(() => null, tools)
const place = "deepseek-harness-global"

function memory(initial: string | null = null) {
  let text = initial
  const io: PromptIo = {
    files: {
      read: async () => text,
      write: async (_ref, next) => { text = next },
      remove: async () => { text = null },
      workspace: async () => null,
    },
    workspace: async () => null,
  }
  return { io, text: () => text }
}

describe("global instructions", () => {
  it("offers only the declared instructions action", () => {
    expect(provider.places).toMatchObject([{ id: place, scope: "global", where: "~/.dsh", generatedOnly: true, forms: [{ id: "instructions" }] }])
  })

  it.each([
    "<!-- context-hub:code-review -->\nUser text\n",
    "User text\n<!-- /context-hub:code-review -->",
    "<!-- /context-hub:code-review -->\n<!-- context-hub:code-review -->",
    "<!-- context-hub:code-review --><!-- context-hub:code-review --><!-- /context-hub:code-review -->",
    "<!-- context-hub:code-review --><!-- /context-hub:code-review --><!-- /context-hub:code-review -->",
    "<!-- context-hub:code-review --><!-- context-hub:another --><!-- /context-hub:code-review --><!-- /context-hub:another -->",
  ])("refuses malformed markers for reads and mutations: %s", async (text) => {
    const data = memory(text)
    await expect(provider.held(data.io, place, prompt)).rejects.toMatchObject({ key: "deepseekHarness.error.sectionBroken" })
    await expect(provider.install(data.io, place, prompt, "instructions")).rejects.toMatchObject({ key: "deepseekHarness.error.sectionBroken" })
    await expect(provider.remove(data.io, place, prompt, "instructions")).rejects.toMatchObject({ key: "deepseekHarness.error.sectionBroken" })
    expect(data.text()).toBe(text)
  })

  it("refuses unknown places, forms, and options", async () => {
    const { io } = memory()
    await expect(provider.held(io, "unknown", prompt)).rejects.toMatchObject({ key: "deepseekHarness.error.unknownPlace" })
    await expect(provider.install(io, place, prompt, "commands")).rejects.toMatchObject({ key: "deepseekHarness.error.unknownForm" })
    await expect(provider.remove(io, place, prompt, "instructions", "option")).rejects.toMatchObject({ key: "deepseekHarness.error.unknownForm" })
  })

  it("refuses to create a section whose own closing marker appears in its body", async () => {
    const data = memory("# User text\n")
    await expect(provider.install(data.io, place, { ...prompt, prompt: "Before\n<!-- /context-hub:code-review -->\nAfter" }, "instructions")).rejects.toMatchObject({ key: "deepseekHarness.error.sectionBroken" })
    expect(data.text()).toBe("# User text\n")
  })

  it("reports errors from the file port with the target path", async () => {
    const { io } = memory()
    io.files.read = async () => { throw new Error("EACCES") }
    await expect(provider.held(io, place, prompt)).rejects.toMatchObject({ key: "deepseekHarness.error.refused", params: { file: ".dsh/AGENTS.md" } })
    const writable = memory()
    writable.io.files.write = async () => { throw new Error("EACCES") }
    await expect(provider.install(writable.io, place, prompt, "instructions")).rejects.toMatchObject({ key: "deepseekHarness.error.refused" })
  })
})
