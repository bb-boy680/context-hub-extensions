import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { apply } from "../src/index.tsx"
import type { CursorScope, SkillPlace } from "../src/contracts.ts"
import { fixture, hostAvailable, mcpTools, promptTools } from "./fixtures.ts"

let f: Awaited<ReturnType<typeof fixture>>
beforeEach(async () => { f = await fixture() })
afterEach(async () => { await f.cleanup() })

describe.skipIf(!hostAvailable)("Cursor registration", () => {
  it("contributes one agent and two non-shared skill places", () => {
    let skill: { id: string; places: SkillPlace[] } | undefined
    let target = ""
    let manifests: readonly string[] = []
    let installer = ""
    const ctx: CursorScope = {
      skills: { register: (value) => { skill = value } },
      prompts: { tools: promptTools, register: () => {} },
      mcp: { tools: mcpTools, register: () => {} },
      plugins: { register: (value) => { installer = value.id }, registerManifests: (value) => { manifests = value } },
      targets: { register: (value) => { target = value.id } },
      locales: { register: () => {} },
    }
    apply(ctx)
    expect(skill?.id).toBe("hub.target.cursor")
    expect(target).toBe(skill?.id)
    expect(installer).toBe(target)
    expect(manifests).toEqual([".cursor-plugin/plugin.json"])
    expect(skill?.places.map(({ id, scope, dir }) => ({ id, scope, dir }))).toEqual([
      { id: "cursor", scope: "workspace", dir: ".cursor/skills" },
      { id: "cursor-global", scope: "global", dir: ".cursor/skills" },
    ])
    const outdated = { ...ctx, plugins: { register: ctx.plugins.register } } as unknown as CursorScope
    expect(() => apply(outdated)).toThrow(/native plugin manifest registration/)
  })
})
