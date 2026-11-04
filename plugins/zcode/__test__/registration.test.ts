import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { apply } from "../src/index.tsx"
import { tools, promptTools } from "./helpers.ts"
import type { AgentTargetDescriptor, LocaleContribution, SkillProvider } from "../src/contracts.ts"

function registered() {
  const skills: SkillProvider[] = []
  const targets: AgentTargetDescriptor[] = []
  const locales: LocaleContribution[] = []
  apply({
    skills: { register: (value) => skills.push(value) },
    mcp: { tools, register: () => undefined },
    prompts: { tools: promptTools, register: () => undefined },
    plugins: { registerManifests: () => undefined, register: () => undefined },
    targets: { register: (value) => targets.push(value) },
    locales: { register: (value) => locales.push(value) },
  })
  return { skills, targets, locales }
}

describe("ZCode 注册", () => {
  it("只注册两个原生技能位置，身份与 target 一致", () => {
    const { skills, targets, locales } = registered()
    expect(skills).toHaveLength(1)
    expect(skills[0]!.id).toBe("hub.target.zcode")
    expect(skills[0]!.places.map(({ id, scope, dir, order }) => ({ id, scope, dir, order }))).toEqual([
      { id: "zcode", scope: "workspace", dir: ".zcode/skills", order: 20 },
      { id: "zcode-global", scope: "global", dir: ".zcode/skills", order: 20 },
    ])
    expect(targets).toHaveLength(1)
    expect(targets[0]!.id).toBe(skills[0]!.id)
    expect(targets[0]!.supports).toEqual(["skill", "mcp", "memory", "agent"])
    expect(locales.map((locale) => locale.id)).toEqual(["en", "zh-CN"])
    expect(Object.keys(locales[0]!.messages)).toEqual(Object.keys(locales[1]!.messages))
  })

  it("图标接受可访问属性，原图字节与原始品牌 hash 一致", () => {
    const { targets } = registered()
    const icon = targets[0]!.icon({ className: "size-4", "aria-hidden": true }) as { props: Record<string, unknown> }
    expect(icon.props.className).toBe("size-4")
    expect(icon.props["aria-hidden"]).toBe(true)
    expect(icon.props.viewBox).toBe("0 0 256 218")
    const bytes = readFileSync(new URL("../assets/icon.svg", import.meta.url))
    expect(bytes.length).toBe(598)
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("2b9d3871496471ced5a758b9ea3b6051819a108d68cb6bed503fe55a28ba8c0c")
  })

  it("声明开发基线和全部服务", () => {
    const manifest = readFileSync(new URL("../plugin.yaml", import.meta.url), "utf8")
    expect(manifest).toContain("inject: [skills, prompts, mcp, plugins, targets, locales]")
    expect(manifest).toContain('engines:\n  contextHub: ">=0.2.0 <0.7.0"')
  })
})
