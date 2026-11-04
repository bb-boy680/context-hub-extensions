import { describe, expect, it } from "vitest"
import { createCopilotPrompts } from "../src/prompts.ts"
import type { PromptRef, PromptTools } from "../src/contracts.ts"

class PromptError extends Error {
  key: string
  constructor(key: string, _params?: Record<string, string>, detail?: string) { super(detail ?? key); this.key = key }
}
const tools: PromptTools = {
  slugOf: (name) => name.toLowerCase(), describeBody: (body) => body, commandFile: () => "",
  withSection: (old, v) => `${old?.replace(new RegExp(`<!-- context-hub:${v.slug} -->.*?<!-- /context-hub:${v.slug} -->`, "s"), "") ?? ""}<!-- context-hub:${v.slug} -->${v.body}<!-- /context-hub:${v.slug} -->`,
  withoutSection: (old, slug) => old.includes(`<!-- context-hub:${slug} -->`) ? old.replace(new RegExp(`<!-- context-hub:${slug} -->.*?<!-- /context-hub:${slug} -->`, "s"), "") : null,
  PromptError,
}
const provider = createCopilotPrompts(tools, () => null)
const prompt = { name: "demo", description: "description", prompt: "content" }
function memory() {
  const files = new Map<string, string>(), key = (ref: PromptRef) => `${ref.scope}:${ref.file}`
  const port = { read: async (ref: PromptRef) => files.get(key(ref)) ?? null, write: async (ref: PromptRef, text: string) => { files.set(key(ref), text) }, remove: async (ref: PromptRef) => { files.delete(key(ref)) }, workspace: async () => "/workspace" }
  return { files, io: { files: port, workspace: port.workspace } }
}
describe("Copilot prompt delivery", () => {
  it.each([["copilot-prompts", "instructions"], ["copilot-prompts", "rule"], ["copilot-prompts", "agent"], ["copilot-prompts-global", "instructions"], ["copilot-prompts-global", "rule"], ["copilot-prompts-global", "agent"], ["copilot-prompts-vscode", "commands"]])("delivers and removes %s %s", async (place, form) => {
    const { io } = memory()
    await provider.install(io, place!, prompt, form!)
    expect((await provider.held(io, place!, prompt))[form!]).toBe(true)
    await provider.install(io, place!, prompt, form!)
    expect(await provider.remove(io, place!, prompt, form!)).toBe(true)
    expect(await provider.remove(io, place!, prompt, form!)).toBe(false)
  })
  it("preserves a broken marked section", async () => {
    const { files, io } = memory()
    const text = '<!-- context-hub:demo -->\nuser content'
    files.set("workspace:.github/copilot-instructions.md", text)
    await expect(provider.remove(io, "copilot-prompts", prompt, "instructions")).rejects.toThrow()
    expect(files.get("workspace:.github/copilot-instructions.md")).toBe(text)
  })
  it("refuses an unowned file", async () => {
    const { files, io } = memory()
    files.set("workspace:.github/agents/demo.agent.md", "mine")
    await expect(provider.install(io, "copilot-prompts", prompt, "agent")).rejects.toThrow()
    expect(files.get("workspace:.github/agents/demo.agent.md")).toBe("mine")
  })
})
