import { describe, expect, it } from "vitest"
import type { Prompt, PromptIo, PromptTools } from "../src/contracts.ts"
import { createTraeIdePrompts } from "../src/prompts.ts"

class TestError extends Error {
  constructor(public key: string) { super(key) }
}
const tools: PromptTools = {
  PromptError: TestError,
  slugOf: (name) => name.toLowerCase().replaceAll(" ", "-"),
  describeBody: (body) => body.split("\n")[0] ?? "",
  commandFile: ({ body }) => `${body}\n`,
}
const prompt: Prompt = { name: "Review Code", description: 'Line one\n"two"', prompt: "Review $ARGUMENTS." }
function memory(initial: string | null = null) {
  let text = initial
  let writes = 0
  const io: PromptIo = { files: {
    read: async () => text,
    write: async (_ref, next) => { text = next; writes++ },
    remove: async () => { text = null; writes++ },
  } }
  return { io, text: () => text, writes: () => writes }
}
const provider = createTraeIdePrompts(() => null, tools)

describe("Trae IDE rules", () => {
  it("writes a quoted description and owned body, idempotently", async () => {
    const store = memory()
    await provider.install(store.io, "trae-ide-rules", prompt, "rule")
    expect(store.text()).toBe('---\nalwaysApply: false\ndescription: "Line one \\"two\\""\n---\n\n<!-- context-hub:review-code -->\nReview $ARGUMENTS.\n')
    expect(await provider.held(store.io, "trae-ide-rules", prompt)).toEqual({ rule: true })
    await provider.install(store.io, "trae-ide-rules", prompt, "rule")
    expect(store.writes()).toBe(1)
    expect(await provider.remove(store.io, "trae-ide-rules", prompt, "rule")).toBe(true)
  })
  it("recognizes BOM and CRLF while rejecting markers elsewhere", async () => {
    const own = memory('\uFEFF---\r\ndescription: "x"\r\n---\r\n\r\n<!-- context-hub:review-code -->\r\nBody')
    expect(await provider.held(own.io, "trae-ide-rules", prompt)).toEqual({ rule: true })
    const other = memory('---\ndescription: "x"\n---\nHandwritten\n<!-- context-hub:review-code -->\n')
    await expect(provider.install(other.io, "trae-ide-rules", prompt, "rule")).rejects.toThrow()
    expect(await provider.remove(other.io, "trae-ide-rules", prompt, "rule")).toBe(false)
    expect(other.writes()).toBe(0)
  })
  it.each(["../outside", "..\\outside", "C:\\outside", ".."])("refuses unsafe name %s", async (name) => {
    const store = memory()
    await expect(provider.install(store.io, "trae-ide-rules", { ...prompt, name }, "rule")).rejects.toThrow()
    expect(store.writes()).toBe(0)
  })
  it("rejects unknown places, forms and options before writes", async () => {
    const store = memory()
    await expect(provider.install(store.io, "other", prompt, "rule")).rejects.toThrow()
    await expect(provider.install(store.io, "trae-ide-rules", prompt, "agent")).rejects.toThrow()
    await expect(provider.install(store.io, "trae-ide-rules", prompt, "rule", "other")).rejects.toThrow()
    expect(store.writes()).toBe(0)
  })
})
