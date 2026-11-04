import { createHash } from "node:crypto"
import { readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type { AgentTargetDescriptor, DeepSeekHarnessScope, LocaleContribution, McpProvider, PromptProvider, SkillProvider } from "../src/contracts.ts"
import { apply } from "../src/index.tsx"

const root = fileURLToPath(new URL("..", import.meta.url))

describe("DeepSeek Harness registration", () => {
  it("registers the target, accessible icon and both languages", () => {
    const targets: AgentTargetDescriptor[] = []
    const locales: LocaleContribution[] = []
    const skills: SkillProvider[] = []
    const mcp: McpProvider[] = []
    const prompts: PromptProvider[] = []
    const scope: DeepSeekHarnessScope = {
      skills: { register: (provider) => skills.push(provider) },
      plugins: { registerManifestRules: () => undefined, register: () => undefined },
      mcp: { tools: {} as DeepSeekHarnessScope["mcp"]["tools"], register: (provider) => mcp.push(provider) },
      prompts: { tools: {} as DeepSeekHarnessScope["prompts"]["tools"], register: (provider) => prompts.push(provider) },
      targets: { register: (target) => targets.push(target) },
      locales: { register: (locale) => locales.push(locale) },
    }
    apply(scope)
    expect(targets).toHaveLength(1)
    expect(targets[0]?.id).toBe("hub.target.deepseek-harness")
    expect(targets[0]?.supports).toEqual(["skill", "memory", "mcp"])
    expect(mcp).toHaveLength(1)
    expect(mcp[0]?.id).toBe(targets[0]?.id)
    expect(mcp[0]?.places).toMatchObject([{ id: "deepseek-harness-home", file: "cordis.patch.yml", installable: true }])
    expect(prompts).toHaveLength(1)
    expect(prompts[0]?.places[0]?.forms.map((form) => form.id)).toEqual(["instructions"])
    expect(skills).toHaveLength(1)
    expect(skills[0]?.id).toBe(targets[0]?.id)
    expect(skills[0]?.shared).toBeUndefined()
    expect(skills[0]?.places).toEqual([
      { id: "deepseek-harness", labelKey: "deepseekHarness.tab", icon: expect.any(Function), scope: "workspace", dir: ".dsh/skills", order: 20 },
      { id: "deepseek-harness-global", labelKey: "deepseekHarness.tab", icon: expect.any(Function), scope: "global", dir: ".dsh/skills", order: 20 },
    ])
    const icon = targets[0]?.icon({ className: "icon", "aria-hidden": true }) as { props: Record<string, unknown> }
    expect(icon.props).toMatchObject({ src: "/hub/extensions/deepseek-harness/assets/icon.svg", className: "icon", "aria-hidden": true, alt: "" })
    expect(locales.map((locale) => locale.id)).toEqual(["en", "zh-CN"])
    expect(Object.keys(locales[0]!.messages).sort()).toEqual(Object.keys(locales[1]!.messages).sort())
  })

  it("ships the correct manifest, package and unchanged upstream mark", () => {
    const manifest = readFileSync(`${root}/plugin.yaml`, "utf8")
    const pkg = JSON.parse(readFileSync(`${root}/package.json`, "utf8")) as { name: string; main: string }
    expect(pkg).toMatchObject({ name: "deepseek-harness", main: "lib/index.js" })
    expect(manifest).toContain("id: deepseek-harness")
    expect(manifest).toContain("inject: [skills, prompts, mcp, plugins, targets, locales]")
    expect(manifest).not.toMatch(/^(version|entry):/m)
    const icon = `${root}/assets/icon.svg`
    expect(statSync(icon).size).toBe(7281)
    expect(createHash("sha256").update(readFileSync(icon)).digest("hex")).toBe("0458ed5e4825846a6560e90d3e4de767cd75842f7eb53539dc87a5db380d9146")
    expect(readFileSync(`${root}/assets/LICENSE.deepseek-harness.txt`, "utf8")).toContain("Copyright (c) 2026 DeepSeek")
  })
})
