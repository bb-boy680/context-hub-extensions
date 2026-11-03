import { expect, it } from "vitest"
import { createAntigravityPrompts } from "../src/prompts.ts"
import type { PromptIo, PromptRef, PromptTools } from "../src/contracts.ts"

it("工作区只提供原生规则并保护非本扩展创建的文件", async () => {
  const tools: PromptTools = {
    slugOf: (name) => name,
    describeBody: (body) => body,
    commandFile: ({ body }) => `${body}\n`,
    withSection: () => "",
    withoutSection: () => null,
    PromptError: class extends Error { key: string; constructor(key: string) { super(key); this.key = key } },
  }
  const provider = createAntigravityPrompts(() => null, tools)
  expect(provider.places.find((place) => place.id === "antigravity")?.forms.map((form) => form.id)).toEqual(["rule"])
  const map = new Map<string, string>()
  const files = { read: async (ref: PromptRef) => map.get(ref.file) ?? null, write: async (ref: PromptRef, text: string) => { map.set(ref.file, text) }, remove: async (ref: PromptRef) => { map.delete(ref.file) }, workspace: async () => null }
  const io: PromptIo = { files, workspace: files.workspace }
  const prompt = { name: "review", description: "Review", prompt: "Review code" }
  await provider.install(io, "antigravity", prompt, "rule")
  expect(map.get(".agents/rules/context-hub-review.md")).toContain("trigger: model_decision")
  map.set(".agents/rules/context-hub-review.md", "manual")
  await expect(provider.install(io, "antigravity", prompt, "rule")).rejects.toThrow()
  expect(map.get(".agents/rules/context-hub-review.md")).toBe("manual")
})
