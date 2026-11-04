import { describe, expect, it } from "vitest"
import type { PromptIo, PromptRef } from "../src/contracts.ts"
import { createQoderPrompts } from "../src/prompts.ts"
import { promptTools } from "./helpers.ts"

const provider = createQoderPrompts(() => null, promptTools)
const prompt = { name: "代码 Review!", description: "", prompt: "Review the change." }
function memory(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial))
  const writes: string[] = []
  const key = (ref: PromptRef) => `${ref.scope}:${ref.file}`
  const io: PromptIo = {
    files: {
      async read(ref) { return files.get(key(ref)) ?? null },
      async write(ref, text) { writes.push(key(ref)); files.set(key(ref), text) },
      async remove(ref) { writes.push(key(ref)); files.delete(key(ref)) },
      async workspace() { return "/work" },
    },
    async workspace() { return "/work" },
  }
  return { io, files, writes }
}

describe("Qoder 提示词", () => {
  it.each([["qoder", "workspace"], ["qoder-global", "global"]])("在 %s 安装和移除三种文件", async (place, scope) => {
    const { io, files } = memory()
    for (const [form, dir] of [["commands", "commands"], ["rule", "rules"], ["agent", "agents"]]) {
      await provider.install(io, place!, prompt, form!)
      const file = `${scope}:.qoder/${dir}/代码-review.md`
      const text = files.get(file)!
      expect(text).toContain("<!-- context-hub:代码-review -->")
      expect(text).toContain("Review the change.")
      expect(text.startsWith("---")).toBe(form !== "rule")
      if (form !== "rule") expect(text).toContain('description: "Review the change."')
      await provider.install(io, place!, prompt, form!)
      expect(files.get(file)).toBe(text)
      expect((await provider.held(io, place!, prompt))[form!]).toBe(true)
      expect(await provider.remove(io, place!, prompt, form!)).toBe(true)
      expect(await provider.remove(io, place!, prompt, form!)).toBe(false)
    }
  })
  it("全局指令仅更新自身区块并保留其他内容", async () => {
    const path = "global:.qoder/AGENTS.md"
    const { io, files } = memory({ [path]: "# Mine\nKeep this.\n" })
    await provider.install(io, "qoder-global", prompt, "instructions")
    await provider.install(io, "qoder-global", prompt, "instructions")
    expect(files.get(path)!.match(/<!-- context-hub:/g)).toHaveLength(1)
    expect(await provider.remove(io, "qoder-global", prompt, "instructions")).toBe(true)
    expect(files.get(path)).toContain("Keep this.")
  })
  it("拒绝手写文件、损坏标记及无效形式", async () => {
    const command = "workspace:.qoder/commands/代码-review.md"
    const section = "global:.qoder/AGENTS.md"
    const { io, files, writes } = memory({ [command]: "my text", [section]: "<!-- context-hub:代码-review -->\nmy text" })
    await expect(provider.install(io, "qoder", prompt, "commands")).rejects.toMatchObject({ key: "qoder.error.handwritten" })
    await expect(provider.remove(io, "qoder", prompt, "commands")).rejects.toMatchObject({ key: "qoder.error.handwritten" })
    await expect(provider.install(io, "qoder-global", prompt, "instructions")).rejects.toMatchObject({ key: "qoder.error.section" })
    await expect(provider.install(io, "qoder", prompt, "instructions")).rejects.toMatchObject({ key: "qoder.error.form" })
    await expect(provider.install(io, "qoder", prompt, "rule", "unexpected")).rejects.toMatchObject({ key: "qoder.error.form" })
    expect(writes).toHaveLength(0)
    expect(files.get(command)).toBe("my text")
    expect(provider.places.find((place) => place.id === "qoder")!.forms.map((form) => form.id)).not.toContain("instructions")
  })
})
