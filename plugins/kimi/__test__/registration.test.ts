import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { apply } from "../src/index.tsx"
import type { KimiScope } from "../src/contracts.ts"

describe("Kimi registration", () => {
  it("registers one target, two native skill paths, MCP, prompts and plugin manifests", () => {
    const targets: unknown[] = [], locales: unknown[] = [], skills: unknown[] = []
    const mcp: unknown[] = [], prompts: unknown[] = [], installers: unknown[] = [], manifests: unknown[] = []
    apply({ skills: { register: (item: unknown) => skills.push(item) },
      mcp: { tools: {}, register: (item: unknown) => mcp.push(item) },
      prompts: { tools: {}, register: (item: unknown) => prompts.push(item) },
      plugins: { registerManifests: (item: unknown) => manifests.push(item), register: (item: unknown) => installers.push(item) },
      targets: { register: (item: unknown) => targets.push(item) },
      locales: { register: (item: unknown) => locales.push(item) } } as unknown as KimiScope)
    expect(skills).toEqual([{ id: "hub.target.kimi-code", places: [
      expect.objectContaining({ scope: "workspace", dir: ".kimi-code/skills" }),
      expect.objectContaining({ scope: "global", dir: ".kimi-code/skills" }),
    ] }])
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({ id: "hub.target.kimi-code", displayName: "Kimi Code" })
    expect(locales).toHaveLength(2)
    expect(mcp).toHaveLength(1)
    expect(prompts).toHaveLength(1)
    expect(installers).toHaveLength(1)
    expect(manifests).toEqual([["kimi.plugin.json", ".kimi-plugin/plugin.json"]])
  })
  it("ships the unchanged official image", () => {
    const bytes = readFileSync(fileURLToPath(new URL("../assets/icon.png", import.meta.url)))
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("59f90505d585b37ea216153859bf357dd5693997316a8ab30662794236b2c273")
    expect(bytes.length).toBeLessThanOrEqual(32 * 1024)
  })
})
