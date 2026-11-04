/**
 * The registrations this extension makes, and the files it ships.
 *
 * The provider assertions arrive in later phases; this first round fixes the
 * identity, the target descriptor, the two language tables and the brand
 * assets, so a broken manifest or a substituted icon fails before any client
 * write is tested.
 */
import { createHash } from "node:crypto"
import { readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import type {
  AgentTargetDescriptor,
  LocaleContribution,
  McpProvider,
  OpenCodeScope,
  PromptProvider,
  SkillProvider,
} from "../src/contracts.ts"
import { apply } from "../src/index.tsx"

const ROOT = fileURLToPath(new URL("..", import.meta.url))

/** A scope that records what `apply` registers and fails on anything else. */
function fakeScope(): {
  scope: OpenCodeScope
  targets: AgentTargetDescriptor[]
  locales: LocaleContribution[]
  skills: SkillProvider[]
  mcp: McpProvider[]
  prompts: PromptProvider[]
} {
  const targets: AgentTargetDescriptor[] = []
  const locales: LocaleContribution[] = []
  const skills: SkillProvider[] = []
  const mcp: McpProvider[] = []
  const prompts: PromptProvider[] = []
  const scope = {
    skills: {
      providers: () => skills,
      register: (provider: SkillProvider) => {
        skills.push(provider)
        return () => undefined
      },
    },
    targets: { register: (target: AgentTargetDescriptor) => targets.push(target) },
    locales: { register: (locale: LocaleContribution) => locales.push(locale) },
    prompts: {
      tools: {},
      register: (provider: PromptProvider) => prompts.push(provider),
    },
    mcp: {
      tools: {},
      register: (provider: McpProvider) => mcp.push(provider),
    },
  } as unknown as OpenCodeScope
  return { scope, targets, locales, skills, mcp, prompts }
}

describe("the skills places", () => {
  it("registers exactly OpenCode's two native directories under the target id", () => {
    const { scope, skills } = fakeScope()
    apply(scope)

    expect(skills).toHaveLength(1)
    const provider = skills[0]
    expect(provider?.id).toBe("hub.target.opencode")
    expect(provider?.shared).toBeUndefined()
    expect(provider?.places).toEqual([
      {
        id: "opencode",
        labelKey: "opencode.tab",
        icon: expect.any(Function),
        scope: "workspace",
        dir: ".opencode/skills",
      },
      {
        id: "opencode-global",
        labelKey: "opencode.tab",
        icon: expect.any(Function),
        scope: "global",
        dir: ".config/opencode/skills",
      },
    ])
  })

  it("leaves the shared and Claude Code directories to their own providers", () => {
    const { scope, skills } = fakeScope()
    apply(scope)

    const dirs = skills[0]?.places.map((place) => place.dir) ?? []
    expect(dirs).not.toContain(".agents/skills")
    expect(dirs).not.toContain(".claude/skills")
  })

  it("gives the target and its skill provider the same id", () => {
    const { scope, skills, targets } = fakeScope()
    apply(scope)

    expect(skills[0]?.id).toBe(targets[0]?.id)
  })
})

describe("the MCP provider", () => {
  it("registers the six physical files under the target id", () => {
    const { scope, mcp } = fakeScope()
    apply(scope)

    expect(mcp).toHaveLength(1)
    expect(mcp[0]?.id).toBe("hub.target.opencode")
    expect(mcp[0]?.places.map((place) => place.file)).toEqual([
      ".config/opencode/opencode.jsonc",
      ".config/opencode/opencode.json",
      "opencode.jsonc",
      "opencode.json",
      ".opencode/opencode.jsonc",
      ".opencode/opencode.json",
    ])
  })
})

describe("the prompt provider", () => {
  it("offers commands and agents in both scopes, and instructions globally", () => {
    const { scope, prompts } = fakeScope()
    apply(scope)

    expect(prompts).toHaveLength(1)
    expect(prompts[0]?.id).toBe("hub.target.opencode")
    const byPlace = Object.fromEntries(
      (prompts[0]?.places ?? []).map((place) => [place.id, place])
    )
    expect(byPlace.opencode?.scope).toBe("workspace")
    expect(byPlace.opencode?.forms.map((form) => form.id)).toEqual(["commands", "agent"])
    expect(byPlace["opencode-global"]?.scope).toBe("global")
    expect(byPlace["opencode-global"]?.forms.map((form) => form.id)).toEqual([
      "commands",
      "agent",
      "instructions",
    ])
  })
})

describe("the extension manifest", () => {
  const manifest = readFileSync(`${ROOT}/plugin.yaml`, "utf8")

  it("declares the identity and the services it reads", () => {
    expect(manifest).toContain("id: opencode")
    expect(manifest).toContain('contextHub: ">=0.2.0 <0.7.0"')
    expect(manifest).toContain("inject: [skills, prompts, mcp, targets, locales]")
    expect(manifest).not.toContain("plugins")
    expect(manifest).toContain("icon: assets/icon.svg")
  })

  it("ships the official mark unchanged", () => {
    const icon = `${ROOT}/assets/icon.svg`
    expect(statSync(icon).size).toBeLessThan(32 * 1024)
    const digest = createHash("sha256").update(readFileSync(icon)).digest("hex")
    expect(digest).toBe("14fba64b47167d4b47d25712a8471e850dff72f3a63621e6049d208a019d8ed1")
  })

  it("ships the upstream licence and its source", () => {
    const licence = readFileSync(`${ROOT}/assets/LICENSE.opencode.txt`, "utf8")
    expect(licence).toContain("MIT License")
    expect(licence).toContain("Copyright (c) 2025 opencode")
    expect(licence).toContain("github.com/anomalyco/opencode")
  })
})

describe("apply", () => {
  it("registers one target whose kinds and paths are OpenCode's", () => {
    const { scope, targets } = fakeScope()
    apply(scope)

    expect(targets).toHaveLength(1)
    const target = targets[0]
    expect(target?.id).toBe("hub.target.opencode")
    expect(target?.displayName).toBe("OpenCode")
    expect(target?.supports).toEqual(["skill", "mcp", "memory", "agent"])
    expect(target?.locations).toEqual(
      expect.arrayContaining([
        { label: "Skills", path: "~/.config/opencode/skills/<name>/SKILL.md" },
        { label: "Project skills", path: ".opencode/skills/<name>/SKILL.md" },
        { label: "Instructions", path: "AGENTS.md" },
      ])
    )
    expect(target?.format).toContain("JSONC")
  })

  it("registers the same message keys in both languages", () => {
    const { scope, locales } = fakeScope()
    apply(scope)

    expect(locales.map((locale) => locale.id)).toEqual(["en", "zh-CN"])
    const [english, chinese] = locales
    expect(Object.keys(english?.messages ?? {}).sort()).toEqual(
      Object.keys(chinese?.messages ?? {}).sort()
    )
    for (const key of Object.keys(english?.messages ?? {})) {
      expect(key.startsWith("opencode.")).toBe(true)
    }
  })
})
