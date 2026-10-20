import { describe, expect, it } from "vitest"

import type { McpIo, McpTools } from "../src/contracts.ts"
import { createCodexMcp } from "../src/provider.ts"

/** The hub's `McpError` shape, with the key and params kept for assertions. */
class FakeMcpError extends Error {
  readonly key: string
  readonly params?: Record<string, string>

  constructor(key: string, params?: Record<string, string>, detail?: string) {
    super(detail === undefined ? key : `${key}: ${detail}`)
    this.name = "McpError"
    this.key = key
    this.params = params
  }
}

interface ToolCalls {
  setEntry: unknown[][]
  setField: unknown[][]
  clearEntry: unknown[][]
  lines: unknown[][]
}

/** The MCP toolkit, with the edits recorded and the parse answer supplied. */
function fakeTools(
  options: {
    document?: Record<string, unknown>
    parse?: (text: string) => Record<string, unknown>
    setEntry?: (text: string, table: string, name: string, values: unknown) => string
    setField?: (
      text: string,
      table: string,
      name: string,
      field: string,
      value: string | boolean
    ) => string
    clearEntry?: (text: string, table: string, name: string) => string
    lines?: (text: string, table: string, name: string) => [number, number] | null
    declaration?: unknown
    written?: unknown
  } = {}
): { tools: McpTools; calls: ToolCalls } {
  const calls: ToolCalls = { setEntry: [], setField: [], clearEntry: [], lines: [] }
  return {
    calls,
    tools: {
      parseToml: options.parse ?? (() => options.document ?? {}),
      setTomlEntry: (text, table, name, values) => {
        calls.setEntry.push([text, table, name, values])
        return options.setEntry?.(text, table, name, values) ?? "entry-edited"
      },
      setTomlField: (text, table, name, field, value) => {
        calls.setField.push([text, table, name, field, value])
        return options.setField?.(text, table, name, field, value) ?? "field-edited"
      },
      clearTomlEntry: (text, table, name) => {
        calls.clearEntry.push([text, table, name])
        return options.clearEntry?.(text, table, name) ?? "entry-cleared"
      },
      tomlEntryLines: (text, table, name) => {
        calls.lines.push([text, table, name])
        return options.lines?.(text, table, name) ?? [1, 2]
      },
      readDeclaration: () =>
        options.declaration ?? { transport: "stdio", command: "declared", args: [], env: {} },
      writeDeclaration: () => options.written ?? { command: "written" },
      McpError: FakeMcpError,
    },
  }
}

/** The files a provider call may reach, with the writes recorded. */
function fakeIo(
  options: { text?: string | null; readError?: Error; writeError?: Error } = {}
): { io: McpIo; writes: { place: unknown; text: string }[] } {
  const writes: { place: unknown; text: string }[] = []
  return {
    writes,
    io: {
      files: {
        read: async () => {
          if (options.readError !== undefined) throw options.readError
          return options.text ?? null
        },
        write: async (place, text) => {
          if (options.writeError !== undefined) throw options.writeError
          writes.push({ place, text })
        },
      },
      log: () => {},
    },
  }
}

const declaration = { transport: "stdio", command: "node", args: ["server.js"], env: {} }

describe("createCodexMcp", () => {
  it("registers one switchable machine-wide place", () => {
    const provider = createCodexMcp(fakeTools().tools)

    expect(provider.id).toBe("hub.target.codex")
    expect(provider.places).toEqual([
      {
        id: "codex-global",
        label: "Codex",
        switchable: true,
        scope: "global",
        file: ".codex/config.toml",
      },
    ])
  })

  it("reads an absent file as no servers", async () => {
    const provider = createCodexMcp(fakeTools().tools)
    const { io } = fakeIo({ text: null })

    expect(await provider.read(io, "codex-global")).toEqual([])
  })

  it("reads every entry and treats a missing enabled field as on", async () => {
    const provider = createCodexMcp(
      fakeTools({
        document: {
          mcp_servers: {
            one: { command: "one" },
            two: { command: "two", enabled: false },
          },
        },
        declaration: { transport: "stdio", command: "declared", args: [], env: {} },
      }).tools
    )
    const { io } = fakeIo({ text: "[mcp_servers.one]\ncommand = 'one'\n" })

    expect(await provider.read(io, "codex-global")).toEqual([
      {
        name: "one",
        declaration: { transport: "stdio", command: "declared", args: [], env: {} },
        enabled: true,
      },
      {
        name: "two",
        declaration: { transport: "stdio", command: "declared", args: [], env: {} },
        enabled: false,
      },
    ])
  })

  it("names a bad TOML document as its own failure", async () => {
    const provider = createCodexMcp(
      fakeTools({
        parse: () => {
          throw new Error("bad toml")
        },
      }).tools
    )
    const { io } = fakeIo({ text: "not toml" })

    await expect(provider.read(io, "codex-global")).rejects.toMatchObject({
      key: "codex.error.parse",
    })
  })

  it("names a read refusal as its own failure", async () => {
    const provider = createCodexMcp(fakeTools().tools)
    const { io } = fakeIo({ readError: new Error("denied") })

    await expect(provider.read(io, "codex-global")).rejects.toMatchObject({
      key: "codex.error.refused",
      params: { file: ".codex/config.toml" },
    })
  })

  it("refuses a place it does not own", async () => {
    const provider = createCodexMcp(fakeTools().tools)
    const { io } = fakeIo()

    await expect(provider.read(io, "elsewhere")).rejects.toMatchObject({
      key: "codex.error.unknownPlace",
      params: { place: "elsewhere" },
    })
  })

  it("writes a new declaration through the entry editor", async () => {
    const { tools, calls } = fakeTools({
      written: { command: "node", args: ["server.js"] },
    })
    const provider = createCodexMcp(tools)
    const { io, writes } = fakeIo({ text: "" })

    await provider.install(io, "codex-global", "server", declaration)

    expect(calls.setEntry).toEqual([
      ["", "mcp_servers", "server", { command: "node", args: ["server.js"] }],
    ])
    expect(writes).toEqual([
      {
        place: { scope: "global", file: ".codex/config.toml" },
        text: "entry-edited",
      },
    ])
  })

  it("keeps a server switched off when its declaration is replaced", async () => {
    const { tools, calls } = fakeTools({
      document: { mcp_servers: { server: { command: "old", enabled: false } } },
      written: { command: "new" },
    })
    const provider = createCodexMcp(tools)
    const { io } = fakeIo({ text: "[mcp_servers.server]\ncommand = 'old'\nenabled = false\n" })

    await provider.install(io, "codex-global", "server", declaration)

    expect(calls.setEntry[0]?.[3]).toEqual({ command: "new", enabled: false })
  })

  it("names an edit refusal as its own failure", async () => {
    const { tools } = fakeTools({
      setEntry: () => {
        throw new Error("refused")
      },
    })
    const provider = createCodexMcp(tools)
    const { io } = fakeIo({ text: "" })

    await expect(provider.install(io, "codex-global", "server", declaration)).rejects.toMatchObject(
      {
        key: "codex.error.refused",
        params: { file: ".codex/config.toml" },
      }
    )
  })

  it("removes one entry and leaves the rest of the file to the editor", async () => {
    const { tools, calls } = fakeTools()
    const provider = createCodexMcp(tools)
    const text = "[mcp_servers.server]\ncommand = 'x'\n"
    const { io, writes } = fakeIo({ text })

    await provider.uninstall(io, "codex-global", "server")

    expect(calls.clearEntry).toEqual([[text, "mcp_servers", "server"]])
    expect(writes[0]?.text).toBe("entry-cleared")
  })

  it("switches one entry through the field editor", async () => {
    const { tools, calls } = fakeTools()
    const provider = createCodexMcp(tools)
    const text = "[mcp_servers.server]\ncommand = 'x'\n"
    const { io, writes } = fakeIo({ text })
    const setEnabled = provider.setEnabled
    if (setEnabled === undefined) throw new Error("setEnabled is missing")

    await setEnabled(io, "codex-global", "global", "server", false)

    expect(calls.setField).toEqual([[text, "mcp_servers", "server", "enabled", false]])
    expect(writes[0]?.text).toBe("field-edited")
  })

  it("names a switch refusal as its own failure", async () => {
    const { tools } = fakeTools({
      setField: () => {
        throw new Error("refused")
      },
    })
    const provider = createCodexMcp(tools)
    const { io } = fakeIo({ text: "[mcp_servers.server]\ncommand = 'x'\n" })
    const setEnabled = provider.setEnabled
    if (setEnabled === undefined) throw new Error("setEnabled is missing")

    await expect(setEnabled(io, "codex-global", "global", "server", true)).rejects.toMatchObject({
      key: "codex.error.refused",
      params: { file: ".codex/config.toml" },
    })
  })

  it("points at one entry's lines, or at nothing when the file is absent", async () => {
    const { tools, calls } = fakeTools({ lines: () => [3, 5] })
    const provider = createCodexMcp(tools)
    const text = "[mcp_servers.server]\ncommand = 'x'\n"
    const { io } = fakeIo({ text })
    const locate = provider.locate
    if (locate === undefined) throw new Error("locate is missing")

    expect(await locate(io, "codex-global", "server")).toEqual([3, 5])
    expect(calls.lines).toEqual([[text, "mcp_servers", "server"]])

    const absent = fakeIo({ text: null })
    expect(await locate(absent.io, "codex-global", "server")).toBeNull()
  })
})
