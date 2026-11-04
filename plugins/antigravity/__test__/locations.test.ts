import { expect, it } from "vitest"
import { ANTIGRAVITY_ID, GLOBAL_SKILLS, PROJECT_LOCATIONS, SUPPORTS } from "../src/locations.ts"
import { messages, zhMessages } from "../src/messages.ts"
import { createAntigravityMcp } from "../src/provider.ts"
import type { McpTools } from "../src/contracts.ts"

it("声明原生全局技能和共享工作区位置，中英文键一致", () => {
  expect(ANTIGRAVITY_ID).toBe("hub.target.antigravity")
  expect(GLOBAL_SKILLS).toBe(".gemini/config/skills")
  expect(PROJECT_LOCATIONS.find((entry) => entry.label === "Skills")?.path).toBe(".agents/skills/<name>/SKILL.md")
  expect(SUPPORTS).toEqual(["skill", "mcp", "memory", "agent"])
  expect(Object.keys(messages).sort()).toEqual(Object.keys(zhMessages).sort())
})

it("未知 MCP 位置包括对象原型键都拒绝读取", async () => {
  let reads = 0
  const provider = createAntigravityMcp({ McpError: Error } as unknown as McpTools)
  const io = { files: { read: async () => { reads++; return null }, write: async () => {} }, log: () => {} }
  for (const place of ["other", "constructor", "toString", "__proto__"]) {
    await expect(provider.read(io, place)).rejects.toThrow()
  }
  expect(reads).toBe(0)
})
