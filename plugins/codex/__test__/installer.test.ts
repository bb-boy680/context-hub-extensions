import { describe, expect, it } from "vitest"

import type { PackDescription, PluginTools } from "../src/contracts.ts"
import { codexInstaller, readHeld } from "../src/installer.ts"

interface RunCall {
  program: string
  args: readonly string[]
}

/** The toolkit the plugins module hands an installer, with every call recorded. */
function fakeTools(
  options: {
    output?: string
    has?: boolean
    describe?: (directory: string, name: string) => Promise<PackDescription>
  } = {}
): { tools: PluginTools; calls: RunCall[]; syncs: () => number } {
  const calls: RunCall[] = []
  let syncs = 0
  return {
    calls,
    syncs: () => syncs,
    tools: {
      root: async () => "/hub/library",
      syncMarketplace: async () => {
        syncs += 1
      },
      run: async (program, args) => {
        calls.push({ program, args: [...args] })
        return options.output ?? ""
      },
      files: null,
      has: async () => options.has ?? true,
      describe:
        options.describe ??
        (async (_directory, name) => ({ name, version: "", description: "" })),
    },
  }
}

/** One entry as `codex plugin list --json` reports it. */
function entry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    pluginId: "documents@openai-primary-runtime",
    name: "documents",
    marketplaceName: "openai-primary-runtime",
    version: "26.1015.12040",
    installed: true,
    enabled: true,
    source: { source: "local", path: "C:\\cache\\documents" },
    ...overrides,
  }
}

describe("codexInstaller", () => {
  it("keeps one machine-wide place and declares no switch", () => {
    expect(codexInstaller.places).toEqual([
      {
        id: "codex-user",
        label: "Codex",
        scope: "global",
        scopeWord: "user",
        switchable: false,
      },
    ])
    expect(codexInstaller.setEnabled).toBeUndefined()
    expect(codexInstaller.switches).toBeUndefined()
  })

  it("asks whether the codex program is on this machine", async () => {
    expect(await codexInstaller.available(fakeTools({ has: true }).tools)).toBe(true)
    expect(await codexInstaller.available(fakeTools({ has: false }).tools)).toBe(false)
  })

  it("reads the packs Codex lists, with the client's own id and source", () => {
    const packs = readHeld(
      JSON.stringify({
        installed: [
          entry(),
          entry({
            pluginId: undefined,
            name: "hud",
            marketplaceName: undefined,
            enabled: false,
            source: undefined,
          }),
        ],
      })
    )

    expect(packs).toHaveLength(2)
    expect(packs[0]).toEqual({
      name: "documents",
      id: "documents@openai-primary-runtime",
      version: "26.1015.12040",
      scope: "user",
      enabled: true,
      marketplace: "openai-primary-runtime",
      source: { kind: "local", path: "C:\\cache\\documents" },
      pack: { name: "", version: "", description: "" },
    })
    expect(packs[1]).toEqual({
      name: "hud",
      id: "hud",
      version: "26.1015.12040",
      scope: "user",
      enabled: false,
      marketplace: null,
      pack: { name: "", version: "", description: "" },
    })
  })

  it("drops what it cannot read and what the client did not install", () => {
    expect(readHeld("not json")).toEqual([])
    expect(readHeld("{}")).toEqual([])
    expect(readHeld(JSON.stringify({ installed: "nope" }))).toEqual([])
    expect(readHeld(JSON.stringify({ installed: [entry({ name: "" })] }))).toEqual([])
    expect(readHeld(JSON.stringify({ installed: [entry({ installed: false })] }))).toEqual([])
  })

  it("runs the client's list and fills each pack's own fields", async () => {
    const { tools, calls } = fakeTools({
      output: JSON.stringify({ installed: [entry()] }),
      describe: async (directory, name) => ({
        name,
        version: "1.0.0",
        description: directory,
      }),
    })

    const packs = await codexInstaller.held(tools)

    expect(calls).toEqual([{ program: "codex", args: ["plugin", "list", "--json"] }])
    expect(packs[0]?.pack).toEqual({
      name: "documents",
      version: "1.0.0",
      description: "C:\\cache\\documents",
    })
  })

  it("keeps the empty pack when the directory cannot be described", async () => {
    const { tools } = fakeTools({
      output: JSON.stringify({ installed: [entry()] }),
      describe: async () => {
        throw new Error("gone")
      },
    })

    const packs = await codexInstaller.held(tools)

    expect(packs[0]?.pack).toEqual({ name: "", version: "", description: "" })
  })

  it("syncs the marketplace, adds it, then installs the pack by name", async () => {
    const { tools, calls, syncs } = fakeTools({
      output: JSON.stringify({ installedPath: "C:\\codex\\plugins\\documents" }),
    })

    const report = await codexInstaller.install("documents", "user", tools)

    expect(syncs()).toBe(1)
    expect(calls).toEqual([
      {
        program: "codex",
        args: ["plugin", "marketplace", "add", "/hub/library", "--json"],
      },
      { program: "codex", args: ["plugin", "add", "documents@context-hub", "--json"] },
    ])
    expect(report).toEqual({
      message: "documents installed for Codex",
      location: "C:\\codex\\plugins\\documents",
    })
  })

  it("reports the install even when the client's report is unreadable", async () => {
    const { tools } = fakeTools({ output: "not json" })

    expect(await codexInstaller.install("documents", "user", tools)).toEqual({
      message: "documents installed for Codex",
    })
  })

  it("removes the pack by the id the client itself listed", async () => {
    const { tools, calls } = fakeTools()

    const report = await codexInstaller.remove("documents@openai-primary-runtime", "user", tools)

    expect(calls).toEqual([
      {
        program: "codex",
        args: ["plugin", "remove", "documents@openai-primary-runtime", "--json"],
      },
    ])
    expect(report).toEqual({ message: "documents@openai-primary-runtime removed from Codex" })
  })
})
