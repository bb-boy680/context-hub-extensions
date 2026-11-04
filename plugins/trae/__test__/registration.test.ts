import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type { AgentTargetDescriptor, LocaleContribution, SkillProvider, TraeScope } from "../src/contracts.ts"
import { apply } from "../src/index.tsx"

const root = fileURLToPath(new URL("..", import.meta.url))

describe("registration", () => {
  it("registers separate targets and matching skill providers and locales", () => {
    const skills: SkillProvider[] = []
    const targets: AgentTargetDescriptor[] = []
    const locales: LocaleContribution[] = []
    apply({
      skills: { register: (value) => skills.push(value) },
      mcp: { tools: {} as TraeScope["mcp"]["tools"], register: () => undefined },
      prompts: { tools: {} as TraeScope["prompts"]["tools"], register: () => undefined },
      targets: { register: (value) => targets.push(value) },
      locales: { register: (value) => locales.push(value) },
    } satisfies TraeScope)
    expect(targets.map((target) => target.id)).toEqual(["hub.target.trae-ide", "hub.target.trae-cli"])
    expect(skills.map((provider) => provider.id)).toEqual(targets.map((target) => target.id))
    expect(skills[0]?.places.map(({ id, scope, dir }) => ({ id, scope, dir }))).toEqual([
      { id: "trae-ide-skills", scope: "workspace", dir: ".trae/skills" },
      { id: "trae-ide-skills-global", scope: "global", dir: ".trae-cn/skills" },
    ])
    expect(skills[1]?.places).toEqual([])
    expect(targets.map((target) => target.supports)).toEqual([["skill", "mcp", "memory"], ["mcp"]])
    expect(locales.map((locale) => locale.id)).toEqual(["en", "zh-CN"])
    expect(Object.keys(locales[0]!.messages).sort()).toEqual(Object.keys(locales[1]!.messages).sort())
    const icon = targets[0]!.icon({ className: "size", "aria-hidden": true }) as { props: Record<string, unknown> }
    expect(icon.props).toMatchObject({ src: "/hub/extensions/trae/assets/icon.png", className: "size", "aria-hidden": true, alt: "" })
  })

  it("registers contributions through service effects that can be disposed", () => {
    const held: unknown[] = []
    const effects: (() => void)[] = []
    const register = (value: unknown) => {
      held.push(value)
      const dispose = () => { const index = held.indexOf(value); if (index >= 0) held.splice(index, 1) }
      effects.push(dispose)
      return dispose
    }
    apply({
      skills: { register }, mcp: { tools: {} as TraeScope["mcp"]["tools"], register },
      prompts: { tools: {} as TraeScope["prompts"]["tools"], register },
      targets: { register }, locales: { register },
    })
    expect(held).toHaveLength(9)
    effects.forEach((dispose) => dispose())
    expect(held).toEqual([])
  })

  it("ships the original official icon and declares its scope", () => {
    const digest = createHash("sha256").update(readFileSync(`${root}/assets/icon.png`)).digest("hex")
    expect(digest).toBe("49d523938a22af5a70dd79923725df38674823026e2f917e76337319969f4af4")
    const manifest = readFileSync(`${root}/plugin.yaml`, "utf8")
    expect(manifest).toContain("inject: [skills, prompts, mcp, targets, locales]")
    expect(manifest).toContain("icon: assets/icon.png")
  })
})
