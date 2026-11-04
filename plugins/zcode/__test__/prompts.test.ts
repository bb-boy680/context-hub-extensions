import { describe, expect, it } from "vitest"
import type { PromptIo } from "../src/contracts.ts"
import { createZCodePrompts } from "../src/prompts.ts"
import { memoryIo, promptTools } from "./helpers.ts"

const prompt = { name: "Code Review", description: "Review changes", prompt: "Check correctness." }
function state(initial: Record<string, string> = {}) {
  const memory = memoryIo(initial)
  const removed: string[] = []
  const io: PromptIo = {
    files: {
      ...memory.io.files,
      async remove(ref) { removed.push(`${ref.scope}:${ref.file}`); memory.files.delete(`${ref.scope}:${ref.file}`) },
      async workspace() { return "/temporary/workspace" },
    },
    async workspace() { return "/temporary/workspace" },
  }
  return { ...memory, io, removed }
}

describe("ZCode 提示词", () => {
  it("只提供 commands/agent 与 global instructions", () => {
    const provider = createZCodePrompts(() => null, promptTools)
    expect(provider.places.map((place) => [place.id, place.forms.map((form) => form.id)])).toEqual([
      ["zcode-global", ["commands", "agent", "instructions"]], ["zcode", ["commands", "agent"]],
    ])
  })

  it.each(["zcode", "zcode-global"])("%s commands/agents 幂等且只删除自身文件", async (place) => {
    const { io, files, removed } = state()
    const provider = createZCodePrompts(() => null, promptTools)
    for (const form of ["commands", "agent"]) {
      await provider.install(io, place, prompt, form)
      await provider.install(io, place, prompt, form)
    }
    expect(files.size).toBe(2)
    expect(await provider.held(io, place, prompt)).toEqual({ commands: true, agent: true })
    for (const text of files.values()) {
      expect(text).toContain('name: "code-review"')
      expect(text).toContain('description: "Review changes"')
      expect(text.match(/context-hub:code-review/g)).toHaveLength(1)
      expect(text).not.toMatch(/tools:|model:|permissionMode:/)
    }
    expect(await provider.remove(io, place, prompt, "agent")).toBe(true)
    expect(removed[0]).toContain(".zcode/agents/code-review.md")
    expect(await provider.held(io, place, prompt)).toEqual({ commands: true })
    expect(await provider.remove(io, place, prompt, "agent")).toBe(false)
  })

  it("instructions 只管理自己的标记段，保留用户正文", async () => {
    const file = "global:.zcode/AGENTS.md"
    const { io, files } = state({ [file]: "# User rules\nKeep this.\n" })
    const provider = createZCodePrompts(() => null, promptTools)
    await provider.install(io, "zcode-global", prompt, "instructions")
    await provider.install(io, "zcode-global", prompt, "instructions")
    expect(files.get(file)!.match(/<!-- context-hub:code-review -->/g)).toHaveLength(1)
    expect(await provider.remove(io, "zcode-global", prompt, "instructions")).toBe(true)
    expect(files.get(file)).toBe("# User rules\nKeep this.\n")
    await provider.install(io, "zcode-global", prompt, "instructions")
    files.set(file, files.get(file)!.replace("<!-- /context-hub:code-review -->", ""))
    const before = files.get(file)
    await expect(provider.remove(io, "zcode-global", prompt, "instructions")).rejects.toMatchObject({ key: "zcode.error.section" })
    expect(files.get(file)).toBe(before)
  })

  it.each(["中文", "x".repeat(65), "../escape", "C:\\outside"])("危险或不受支持名称在写入前失败 %s", async (name) => {
    const { io, writes, removed } = state()
    const provider = createZCodePrompts(() => null, promptTools)
    await expect(provider.install(io, "zcode", { ...prompt, name }, "commands")).rejects.toMatchObject({ key: "zcode.error.slug" })
    expect(writes).toEqual([])
    expect(removed).toEqual([])
  })

  it.each(["general-purpose", "Explore"])("拒绝保留 agent 名 %s", async (name) => {
    const { io, writes } = state()
    await expect(createZCodePrompts(() => null, promptTools).install(io, "zcode", { ...prompt, name }, "agent")).rejects.toMatchObject({ key: "zcode.error.reserved" })
    await createZCodePrompts(() => null, promptTools).install(io, "zcode", { ...prompt, name }, "commands")
    expect(await createZCodePrompts(() => null, promptTools).held(io, "zcode", { ...prompt, name })).toEqual({ commands: true })
    expect(writes).toHaveLength(1)
  })

  it("拒绝手写文件、未知 place/form/option 和 workspace instructions", async () => {
    const file = "workspace:.zcode/commands/code-review.md"
    const original = "My hand-written command\n"
    const { io, files, writes, removed } = state({ [file]: original })
    const provider = createZCodePrompts(() => null, promptTools)
    await expect(provider.install(io, "zcode", prompt, "commands")).rejects.toMatchObject({ key: "zcode.error.handwritten" })
    await expect(provider.remove(io, "zcode", prompt, "commands")).rejects.toMatchObject({ key: "zcode.error.handwritten" })
    await expect(provider.install(io, "unknown", prompt, "commands")).rejects.toMatchObject({ key: "zcode.error.unknownPlace" })
    for (const [form, option] of [["rules", undefined], ["instructions", undefined], ["commands", "arbitrary"]]) {
      await expect(provider.install(io, "zcode", prompt, form!, option)).rejects.toMatchObject({ key: "zcode.error.form" })
    }
    expect(files.get(file)).toBe(original)
    expect(writes).toEqual([])
    expect(removed).toEqual([])
  })

  it("description 依次回退正文和名称", async () => {
    const { io, files } = state()
    const provider = createZCodePrompts(() => null, promptTools)
    await provider.install(io, "zcode", { ...prompt, description: "" }, "agent")
    expect([...files.values()][0]).toContain('description: "Check correctness."')
    await provider.install(io, "zcode", { ...prompt, description: "", prompt: "" }, "agent")
    expect([...files.values()][0]).toContain('description: "Code Review"')
  })
})
