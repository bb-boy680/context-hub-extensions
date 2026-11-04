import { describe, expect, it } from "vitest"
import { apply } from "../src/index.tsx"
import type { QwenScope } from "../src/contracts.ts"

describe("Qwen Code registration", () => {
  it("registers the target, official PNG and both locales", () => {
    let target: Parameters<QwenScope["targets"]["register"]>[0] | undefined
    const locales: string[] = []
    let skills: Parameters<QwenScope["skills"]["register"]>[0] | undefined
    let manifests: readonly string[] = []
    let installer = ""
    apply({
      skills: { register: value => { skills = value } },
      mcp: { tools: {} as QwenScope["mcp"]["tools"], register: () => {} },
      prompts: { tools: {} as QwenScope["prompts"]["tools"], register: () => {} },
      plugins: { registerManifests: value => { manifests = value }, register: value => { installer = value.id } },
      targets: { register: value => { target = value } },
      locales: { register: value => { locales.push(value.id) } },
    })
    expect(target?.id).toBe("hub.target.qwen-code")
    expect(target?.supports).toEqual(["skill", "mcp", "memory", "agent"])
    expect(skills?.id).toBe(target?.id)
    expect(skills?.places.map(({ id, scope, dir }) => ({ id, scope, dir }))).toEqual([
      { id: "qwen-code", scope: "workspace", dir: ".qwen/skills" },
      { id: "qwen-code-global", scope: "global", dir: ".qwen/skills" },
    ])
    expect(target?.icon({})).toMatchObject({ type: "img", props: { src: "/hub/extensions/qwen-code/assets/icon.png" } })
    expect(locales).toEqual(["en", "zh-CN"])
    expect(manifests).toEqual(["qwen-extension.json"])
    expect(installer).toBe("hub.target.qwen-code")
  })
  it("removes every contribution when its scope is disposed", () => {
    const held = new Map<string, unknown[]>()
    const disposers: (() => void)[] = []
    const register = (key: string, value: unknown) => {
      const entries = held.get(key) ?? []
      entries.push(value)
      held.set(key, entries)
      disposers.push(() => { entries.splice(entries.indexOf(value), 1) })
    }
    apply({
      skills: { register: value => register("skills", value) },
      mcp: { tools: {} as QwenScope["mcp"]["tools"], register: value => register("mcp", value) },
      prompts: { tools: {} as QwenScope["prompts"]["tools"], register: value => register("prompts", value) },
      plugins: { registerManifests: value => register("manifests", value), register: value => register("installers", value) },
      targets: { register: value => register("targets", value) },
      locales: { register: value => register("locales", value) },
    })
    expect([...held.values()].map(entries => entries.length)).toEqual([1, 1, 1, 1, 1, 1, 2])
    disposers.forEach(dispose => dispose())
    expect([...held.values()].every(entries => entries.length === 0)).toBe(true)
  })
})
