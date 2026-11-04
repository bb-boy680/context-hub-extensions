import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { apply } from "../src/index.tsx"

describe("WorkBuddy registration", () => {
  it("registers native assets and two isolated skill locations", () => {
    const values: Record<string, unknown[]> = {}
    const register = (key: string) => (value: unknown) => (values[key] ??= []).push(value)
    apply({
      plugins: { registerManifests: register("manifests"), register: register("plugins") },
      skills: { register: register("skills") },
      mcp: { tools: {}, register: register("mcp") },
      prompts: { tools: {}, register: register("prompts") },
      targets: { register: register("targets") }, locales: { register: register("locales") },
    })
    expect(values.manifests).toEqual([[".codebuddy-plugin/plugin.json"]])
    expect(values.plugins).toHaveLength(1)
    expect(values.skills?.[0]).toMatchObject({ places: [
      { id: "workbuddy", scope: "workspace", dir: ".workbuddy/skills" },
      { id: "workbuddy-global", scope: "global", dir: ".workbuddy/skills" },
    ] })
    expect(values.mcp).toHaveLength(1)
    expect(values.prompts).toHaveLength(1)
    expect(values.targets?.[0]).toMatchObject({ id: "hub.target.workbuddy" })
    const locales = values.locales as { id: string; messages: Record<string, string> }[]
    expect(locales.map((locale) => locale.id)).toEqual(["en", "zh-CN"])
    expect(Object.keys(locales[0]!.messages)).toEqual(Object.keys(locales[1]!.messages))
  })
  it("ships the official icon unchanged", () => {
    const icon = readFileSync(new URL("../assets/icon.svg", import.meta.url))
    expect(createHash("sha256").update(icon).digest("hex"))
      .toBe("10ccbc099e7bc3d5ff12c315c4edd7b21386aa7166c1ec19997b3d55010d5c7d")
  })
})
