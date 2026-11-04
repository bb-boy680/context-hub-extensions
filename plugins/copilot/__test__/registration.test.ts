import { describe, expect, it, vi } from "vitest"
vi.mock("../src/icon.tsx", () => ({ CopilotIcon: () => null }))
import { apply } from "../src/index.tsx"
import type { CopilotScope } from "../src/contracts.ts"

describe("Copilot registration", () => {
  it("registers one target, two distinct skill places and all providers", () => {
    const calls: Record<string, unknown[]> = {}
    const service = (name: string) => ({ register: (value: unknown) => (calls[name] ??= []).push(value), tools: {} })
    apply({ skills: service("skills"), mcp: service("mcp"), prompts: service("prompts"), plugins: service("plugins"), targets: service("targets"), locales: service("locales") } as unknown as CopilotScope)
    expect(calls.targets).toHaveLength(1)
    expect((calls.skills![0] as { places: unknown[] }).places).toHaveLength(2)
    expect(calls.mcp).toHaveLength(1)
    expect(calls.prompts).toHaveLength(1)
    expect(calls.plugins).toHaveLength(1)
    expect(calls.locales).toHaveLength(2)
  })
})
