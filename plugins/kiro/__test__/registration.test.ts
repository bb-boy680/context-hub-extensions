import { describe, expect, it } from "vitest"
import { apply } from "../src/index.tsx"
import type { KiroScope, SkillPlace } from "../src/contracts.ts"

describe("Kiro registration", () => {
  it("registers one target, native skill places and both locales", () => {
    let skill: { id: string; places: SkillPlace[] } | undefined
    let target: Parameters<KiroScope["targets"]["register"]>[0] | undefined
    const locales: string[] = []
    const ctx = {
      skills: { register: (value) => { skill = value } },
      prompts: { tools: {} as KiroScope["prompts"]["tools"], register: (value) => { expect(value.places.map((place) => place.forms.map((form) => form.id))).toEqual([["rule", "agent"], ["rule", "agent", "instructions"]]) } },
      mcp: { tools: {} as KiroScope["mcp"]["tools"], register: (value) => { expect(value.places).toHaveLength(2) } },
      plugins: { register: (value) => { expect(value.id).toBe("hub.target.kiro"); expect(value.places).toMatchObject([{ scope: "global", switchable: false }]) } },
      targets: { register: (value) => { target = value } },
      locales: { register: (value) => { locales.push(value.id) } },
    } as KiroScope
    apply(ctx)
    expect(skill?.id).toBe("hub.target.kiro")
    expect(target?.id).toBe(skill?.id)
    expect(target?.supports).toEqual(["skill", "mcp", "memory", "agent"])
    expect(skill?.places.map(({ id, scope, dir }) => ({ id, scope, dir }))).toEqual([
      { id: "kiro", scope: "workspace", dir: ".kiro/skills" },
      { id: "kiro-global", scope: "global", dir: ".kiro/skills" },
    ])
    expect(locales).toEqual(["en", "zh-CN"])
    expect(JSON.stringify(target?.locations)).not.toMatch(/powers|cursor|\.agents\/skills/i)
  })
})
