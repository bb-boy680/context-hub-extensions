import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { apply } from "../src/index.tsx"
import type { AgentTargetDescriptor, LocaleContribution, SkillProvider } from "../src/contracts.ts"
import type { PluginInstaller } from "../src/contracts.ts"

function registered() {
  const skills: SkillProvider[] = []
  const targets: AgentTargetDescriptor[] = []
  const locales: LocaleContribution[] = []
  const manifests: string[][] = []
  const installers: PluginInstaller[] = []
  apply({
    skills: { register: (value) => skills.push(value) },
    prompts: { tools: {} as never, register: () => undefined },
    mcp: { tools: {} as never, register: () => undefined },
    plugins: { registerManifests: (paths) => manifests.push([...paths]), register: (installer: PluginInstaller) => { installers.push(installer) } },
    targets: { register: (value) => targets.push(value) },
    locales: { register: (value) => locales.push(value) },
  })
  return { skills, targets, locales, manifests, installers }
}

describe("Qoder 注册", () => {
  it("注册两个原生技能位置，身份与 target 一致", () => {
    const { skills, targets, locales } = registered()
    expect(skills).toHaveLength(1)
    expect(skills[0]!.id).toBe("hub.target.qoder")
    expect(skills[0]!.places.map(({ id, scope, dir }) => ({ id, scope, dir }))).toEqual([
      { id: "qoder", scope: "workspace", dir: ".qoder/skills" },
      { id: "qoder-global", scope: "global", dir: ".qoder/skills" },
    ])
    expect(targets[0]!.id).toBe(skills[0]!.id)
    expect(targets[0]!.supports).toEqual(["skill", "mcp", "memory", "agent"])
    expect(locales.map((locale) => locale.id)).toEqual(["en", "zh-CN"])
    expect(Object.keys(locales[0]!.messages)).toEqual(Object.keys(locales[1]!.messages))
  })

  it("注册原生清单和三作用域安装器", () => {
    const { manifests, installers } = registered()
    expect(manifests).toEqual([[".qoder-plugin/plugin.json"]])
    expect(installers).toHaveLength(1)
    expect(installers[0]!.places.map(({ scopeWord, switchable }) => ({ scopeWord, switchable }))).toEqual([
      { scopeWord: "user", switchable: true },
      { scopeWord: "project", switchable: true },
      { scopeWord: "local", switchable: true },
    ])
    const manifest = readFileSync(new URL("../plugin.yaml", import.meta.url), "utf8")
    expect(manifest).toContain("inject: [skills, prompts, mcp, plugins, targets, locales]")
  })

  it("保留官方图标原始字节并透传无障碍属性", () => {
    const icon = registered().targets[0]!.icon({ className: "size-4", "aria-hidden": true }) as { props: Record<string, unknown> }
    expect(icon.props.className).toBe("size-4")
    expect(icon.props["aria-hidden"]).toBe(true)
    expect(icon.props.alt).toBe("")
    const bytes = readFileSync(new URL("../assets/icon.png", import.meta.url))
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("2276f0f8e6240959e70b83ebc48ec1dac1c0180e24528794f9a52b7386026f3d")
  })
})
