import { describe, expect, it } from "vitest"
import { createQwenCodePrompts } from "../src/prompts.ts"
import { memoryFiles, promptTools } from "./fixtures.ts"

const provider = createQwenCodePrompts(() => null, promptTools)
const prompt = { name: "检查 代码", description: '多行: "描述"\n第二行', prompt: "﻿First\r\n${INPUT}\r\n" }

describe("Qwen prompts", () => {
  for (const [id, scope, instruction] of [["qwen-code", "workspace", "QWEN.md"], ["qwen-code-global", "global", ".qwen/QWEN.md"]] as const) {
    it(`delivers all forms in ${scope} and preserves instructions`, async () => {
      const { files, io } = memoryFiles()
      await files.write({ scope, file: instruction }, "Keep this text.\n")
      for (const form of ["commands", "skill", "agent", "instructions"]) await provider.install(io, id, prompt, form)
      expect(await provider.held(io, id, prompt)).toEqual({ commands: true, skill: true, agent: true, instructions: true })
      const command = await files.read({ scope, file: ".qwen/commands/检查-代码.md" })
      expect(command).toContain('description: "多行: \\"描述\\"\\n第二行"')
      expect(command).toContain("<!-- context-hub:检查-代码 -->\nFirst\n${INPUT}\n")
      expect(command).not.toContain("name:")
      const skill = await files.read({ scope, file: ".qwen/skills/检查-代码/SKILL.md" })
      expect(skill).toContain('name: "检查-代码"')
      await provider.install(io, id, prompt, "instructions")
      for (const form of ["commands", "skill", "agent", "instructions"]) expect(await provider.remove(io, id, prompt, form)).toBe(true)
      expect(await files.read({ scope, file: instruction })).toContain("Keep this text.")
      expect(await provider.held(io, id, prompt)).toEqual({})
    })
  }
  it("rejects duplicate and reversed section markers", async () => {
    const { files, io } = memoryFiles()
    const ref = { scope: "workspace", file: "QWEN.md" } as const
    const open = "<!-- context-hub:检查-代码 -->", close = "<!-- /context-hub:检查-代码 -->"
    for (const text of [`${close}\n${open}`, `${open}\n${close}\n${open}\n${close}`, close]) {
      await files.write(ref, text)
      await expect(provider.remove(io, "qwen-code", prompt, "instructions")).rejects.toThrow()
      expect(await files.read(ref)).toBe(text)
    }
    await expect(provider.install(io, "qwen-code", prompt, "unknown")).rejects.toThrow()
  })
  it("refuses handwritten files and broken markers", async () => {
    const { files, io } = memoryFiles()
    const command = { scope: "workspace", file: ".qwen/commands/检查-代码.md" } as const
    await files.write(command, "# Mine\n<!-- context-hub:检查-代码 -->")
    await expect(provider.install(io, "qwen-code", prompt, "commands")).rejects.toThrow()
    await expect(provider.remove(io, "qwen-code", prompt, "commands")).rejects.toThrow()
    const instructions = { scope: "workspace", file: "QWEN.md" } as const
    await files.write(instructions, "<!-- context-hub:检查-代码 -->\nUnclosed text")
    await expect(provider.install(io, "qwen-code", prompt, "instructions")).rejects.toThrow()
    expect(await files.read(instructions)).toContain("Unclosed text")
    await expect(provider.install(io, "bad", prompt, "commands")).rejects.toThrow()
    await expect(provider.install(io, "qwen-code", prompt, "commands", "bad")).rejects.toThrow()
  })
})
