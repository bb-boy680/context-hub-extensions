import { describe, expect, it } from "vitest"

import type { McpIo, McpTools } from "../src/contracts.ts"
import { createOpenCodeMcp } from "../src/provider.ts"

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
  edits: { path: (string | number)[]; value: unknown }[]
  lines: (string | number)[][]
}

/**
 * A JSONC stand-in for the mapping tests: it records each path and value, and
 * edits a plain JSON document. The real editor's comment and layout
 * preservation is exercised against the host checkout in `host.test.ts`.
 */
function fakeTools(
  options: { lines?: [number, number] | null; editError?: Error } = {}
): { tools: McpTools; calls: ToolCalls } {
  const calls: ToolCalls = { edits: [], lines: [] }
  return {
    calls,
    tools: {
      editJson: (text, path, value) => {
        if (options.editError !== undefined) throw options.editError
        calls.edits.push({ path: [...path], value })
        const document = text === null || text.trim() === "" ? {} : JSON.parse(text)
        let parent = document as Record<string | number, unknown>
        for (const key of path.slice(0, -1)) {
          const held = parent[key]
          if (typeof held !== "object" || held === null) parent[key] = {}
          parent = parent[key] as Record<string | number, unknown>
        }
        const last = path[path.length - 1]
        if (last === undefined) throw new Error("an edit needs a path")
        if (value === undefined) delete parent[last]
        else parent[last] = value
        return JSON.stringify(document, null, 2)
      },
      readJsonObject: (text) =>
        text === null || text.trim() === "" ? null : (JSON.parse(text) as Record<string, unknown>),
      jsonValueLines: (text, path) => {
        calls.lines.push([...path])
        return options.lines === undefined ? [1, 2] : options.lines
      },
      McpError: FakeMcpError,
    },
  }
}

/** The files a provider call may reach, with the writes recorded. */
function fakeIo(
  options: { text?: string | null; readError?: Error; writeError?: Error } = {}
): { io: McpIo; writes: { place: unknown; text: string }[]; reads: unknown[] } {
  const writes: { place: unknown; text: string }[] = []
  const reads: unknown[] = []
  return {
    writes,
    reads,
    io: {
      files: {
        read: async (place) => {
          reads.push(place)
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

const local = { transport: "stdio" as const, command: "node", args: ["server.js"], env: {} }

/** The document a written text holds, for asserting the final shape. */
function documentOf(text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>
}

describe("the six OpenCode MCP files (OpenCode v2.2.5 target)", () => {
  it("registers each physical file as its own switchable place", () => {
    const provider = createOpenCodeMcp(fakeTools().tools)

    expect(provider.id).toBe("hub.target.opencode")
    expect(provider.places).toEqual([
      {
        id: "opencode-global-jsonc",
        label: "OpenCode · opencode.jsonc",
        switchable: true,
        scope: "global",
        file: ".config/opencode/opencode.jsonc",
      },
      {
        id: "opencode-global-json",
        label: "OpenCode · opencode.json",
        switchable: true,
        scope: "global",
        file: ".config/opencode/opencode.json",
      },
      {
        id: "opencode-workspace-jsonc",
        label: "OpenCode · opencode.jsonc",
        switchable: true,
        scope: "workspace",
        file: "opencode.jsonc",
      },
      {
        id: "opencode-workspace-json",
        label: "OpenCode · opencode.json",
        switchable: true,
        scope: "workspace",
        file: "opencode.json",
      },
      {
        id: "opencode-dotdir-jsonc",
        label: "OpenCode · .opencode/opencode.jsonc",
        switchable: true,
        scope: "workspace",
        file: ".opencode/opencode.jsonc",
      },
      {
        id: "opencode-dotdir-json",
        label: "OpenCode · .opencode/opencode.json",
        switchable: true,
        scope: "workspace",
        file: ".opencode/opencode.json",
      },
    ])
  })

  it("reads and locates each file at its own reference", async () => {
    const provider = createOpenCodeMcp(fakeTools().tools)
    for (const place of provider.places) {
      const read = fakeIo({ text: null })
      expect(await provider.read(read.io, place.id)).toEqual([])
      expect(read.reads).toEqual([{ scope: place.scope, file: place.file }])

      const located = fakeTools({ lines: [2, 3] })
      const locate = createOpenCodeMcp(located.tools).locate
      if (locate === undefined) throw new Error("locate is missing")
      expect(await locate(fakeIo({ text: "{}" }).io, place.id, "files")).toEqual([2, 3])
      expect(located.calls.lines).toEqual([["mcp", "servers", "files"]])
    }
  })

  it("refuses a place it does not own", async () => {
    const provider = createOpenCodeMcp(fakeTools().tools)
    const { io } = fakeIo()

    await expect(provider.read(io, "elsewhere")).rejects.toMatchObject({
      key: "opencode.error.unknownPlace",
      params: { place: "elsewhere" },
    })
  })
})

describe("reading a native V2 file", () => {
  it("reads an absent or empty file as no servers", async () => {
    const provider = createOpenCodeMcp(fakeTools().tools)

    for (const text of [null, "", "  \n"]) {
      expect(await provider.read(fakeIo({ text }).io, "opencode-workspace-jsonc")).toEqual([])
    }
  })

  it("reads a local command array into a stdio declaration", async () => {
    const provider = createOpenCodeMcp(fakeTools().tools)
    const text = JSON.stringify({
      mcp: {
        servers: {
          files: {
            type: "local",
            command: ["node", "server.js", "--root", "a b"],
            environment: { TOKEN: "kept", IGNORED: 3 },
          },
        },
      },
    })

    expect(await provider.read(fakeIo({ text }).io, "opencode-global-jsonc")).toEqual([
      {
        name: "files",
        declaration: {
          transport: "stdio",
          command: "node",
          args: ["server.js", "--root", "a b"],
          env: { TOKEN: "kept" },
        },
        enabled: true,
      },
    ])
  })

  it("reads a remote entry with headers as HTTP", async () => {
    const provider = createOpenCodeMcp(fakeTools().tools)
    const text = JSON.stringify({
      mcp: {
        servers: {
          api: { type: "remote", url: "https://example.test/mcp", headers: { "X-Key": "v" } },
        },
      },
    })

    expect(await provider.read(fakeIo({ text }).io, "opencode-dotdir-json")).toEqual([
      {
        name: "api",
        declaration: {
          transport: "http",
          url: "https://example.test/mcp",
          headers: { "X-Key": "v" },
        },
        enabled: true,
      },
    ])
  })

  it("treats a missing disabled field as on and an explicit true as off", async () => {
    const provider = createOpenCodeMcp(fakeTools().tools)
    const text = JSON.stringify({
      mcp: {
        servers: {
          on: { type: "local", command: ["one"] },
          off: { type: "local", command: ["two"], disabled: true },
        },
      },
    })

    const entries = await provider.read(fakeIo({ text }).io, "opencode-workspace-json")
    expect(entries.map((entry) => [entry.name, entry.enabled])).toEqual([
      ["on", true],
      ["off", false],
    ])
  })

  it("does not mistake a server named servers for the container", async () => {
    const provider = createOpenCodeMcp(fakeTools().tools)
    const text = JSON.stringify({
      mcp: { servers: { servers: { type: "local", command: ["node"] } } },
    })

    const entries = await provider.read(fakeIo({ text }).io, "opencode-workspace-jsonc")
    expect(entries.map((entry) => entry.name)).toEqual(["servers"])
  })

  it("names a malformed entry instead of guessing a declaration", async () => {
    const provider = createOpenCodeMcp(fakeTools().tools)
    const text = JSON.stringify({ mcp: { servers: { bad: { type: "local", command: "node" } } } })

    await expect(provider.read(fakeIo({ text }).io, "opencode-workspace-json")).rejects.toMatchObject(
      { key: "opencode.error.invalidEntry", params: { name: "bad" } }
    )
  })

  it("refuses a file OpenCode V1 shaped", async () => {
    const provider = createOpenCodeMcp(fakeTools().tools)
    const text = JSON.stringify({ mcp: { files: { command: "node", args: ["server.js"] } } })

    await expect(
      provider.read(fakeIo({ text }).io, "opencode-workspace-json")
    ).rejects.toMatchObject({ key: "opencode.error.v2Only" })
  })

  it("names a read refusal as its own failure", async () => {
    const provider = createOpenCodeMcp(fakeTools().tools)
    const { io } = fakeIo({ readError: new Error("denied") })

    await expect(provider.read(io, "opencode-workspace-json")).rejects.toMatchObject({
      key: "opencode.error.refused",
      params: { file: "opencode.json" },
    })
  })
})

describe("installing into a native V2 file", () => {
  it("writes a new local server under mcp.servers", async () => {
    const { tools, calls } = fakeTools()
    const provider = createOpenCodeMcp(tools)
    const { io, writes } = fakeIo({ text: "" })

    await provider.install(io, "opencode-workspace-jsonc", "files", {
      transport: "stdio",
      command: "node",
      args: ["server.js"],
      env: { TOKEN: "v" },
    })

    expect(calls.edits).toEqual([
      {
        path: ["mcp", "servers", "files"],
        value: {
          type: "local",
          command: ["node", "server.js"],
          environment: { TOKEN: "v" },
        },
      },
    ])
    expect(writes[0]?.place).toEqual({ scope: "workspace", file: "opencode.jsonc" })
    expect(documentOf(writes[0]?.text ?? "")).toEqual({
      mcp: {
        servers: {
          files: { type: "local", command: ["node", "server.js"], environment: { TOKEN: "v" } },
        },
      },
    })
  })

  it("writes a new remote server without an empty headers object", async () => {
    const { tools, calls } = fakeTools()
    const provider = createOpenCodeMcp(tools)
    const { io, writes } = fakeIo({ text: "" })

    await provider.install(io, "opencode-global-json", "api", {
      transport: "http",
      url: "https://example.test/mcp",
      headers: {},
    })

    expect(calls.edits[0]?.value).toEqual({ type: "remote", url: "https://example.test/mcp" })
    expect(writes).toHaveLength(1)
  })

  it("refuses SSE without reading or writing", async () => {
    const { tools } = fakeTools()
    const provider = createOpenCodeMcp(tools)
    const { io, writes } = fakeIo({ text: "" })

    await expect(
      provider.install(io, "opencode-workspace-json", "sse", {
        transport: "sse",
        url: "https://example.test/sse",
        headers: {},
      })
    ).rejects.toMatchObject({ key: "opencode.error.sse" })
    expect(writes).toEqual([])
  })

  it("keeps the switch and native options when a stdio server is replaced", async () => {
    const text = JSON.stringify({
      mcp: {
        servers: {
          files: {
            type: "remote",
            url: "https://old.test/mcp",
            headers: { "X-Old": "v" },
            oauth: { client_id: "id" },
            timeout: { execution: 30 },
            codemode: { enabled: true },
            disabled: true,
            custom: "kept",
          },
        },
      },
    })
    const { tools } = fakeTools()
    const provider = createOpenCodeMcp(tools)
    const { io, writes } = fakeIo({ text })

    await provider.install(io, "opencode-workspace-json", "files", local)

    expect(documentOf(writes[0]?.text ?? "")).toEqual({
      mcp: {
        servers: {
          files: {
            type: "local",
            command: ["node", "server.js"],
            timeout: { execution: 30 },
            codemode: { enabled: true },
            disabled: true,
            custom: "kept",
          },
        },
      },
    })
  })

  it("keeps OAuth and shared options when a remote server replaces a local one", async () => {
    const text = JSON.stringify({
      mcp: {
        servers: {
          api: {
            type: "local",
            command: ["node"],
            environment: { TOKEN: "old" },
            cwd: "/tmp",
            oauth: { client_id: "id" },
            timeout: { catalog: 5 },
            disabled: true,
            custom: "kept",
          },
        },
      },
    })
    const { tools } = fakeTools()
    const provider = createOpenCodeMcp(tools)
    const { io, writes } = fakeIo({ text })

    await provider.install(io, "opencode-workspace-json", "api", {
      transport: "http",
      url: "https://example.test/mcp",
      headers: { "X-Key": "v" },
    })

    expect(documentOf(writes[0]?.text ?? "")).toEqual({
      mcp: {
        servers: {
          api: {
            type: "remote",
            url: "https://example.test/mcp",
            headers: { "X-Key": "v" },
            oauth: { client_id: "id" },
            timeout: { catalog: 5 },
            disabled: true,
            custom: "kept",
          },
        },
      },
    })
  })

  it.each([
    ["a flat server", { mcp: { files: { command: "node" } } }],
    [
      "a mixed file",
      {
        mcp: {
          flat: { command: "node" },
          servers: { files: { type: "local", command: ["node"] } },
        },
      },
    ],
    ["an old enabled switch", { mcp: { servers: { files: { type: "local", command: ["node"], enabled: true } } } }],
    ["a numeric timeout", { mcp: { servers: { files: { type: "local", command: ["node"], timeout: 5 } } } }],
    ["an old SSE type", { mcp: { servers: { files: { type: "sse", url: "https://x.test" } } } }],
    ["an entry without a V2 type", { mcp: { servers: { files: { command: "node" } } } }],
    [
      "camelCase OAuth",
      {
        mcp: {
          servers: {
            files: { type: "remote", url: "https://x.test", oauth: { clientId: "id" } },
          },
        },
      },
    ],
  ])("refuses %s without writing a byte", async (_what, document) => {
    const text = JSON.stringify(document)
    const { tools } = fakeTools()
    const provider = createOpenCodeMcp(tools)
    const { io, writes } = fakeIo({ text })

    await expect(provider.install(io, "opencode-workspace-json", "files", local)).rejects.toMatchObject(
      { key: "opencode.error.v2Only" }
    )
    expect(writes).toEqual([])
  })

  it.each([
    { enabled: true },
    { timeout: 10 },
    { oauth: { clientId: "old" } },
  ])("refuses all writes when another server carries legacy fields: %j", async (legacy) => {
    const text = JSON.stringify({ mcp: { servers: {
      files: { type: "local", command: ["node"] },
      other: { type: "local", command: ["old"], ...legacy },
    } } })
    const provider = createOpenCodeMcp(fakeTools().tools)
    const { io, writes } = fakeIo({ text })
    const setEnabled = provider.setEnabled
    if (setEnabled === undefined) throw new Error("setEnabled is missing")
    await expect(provider.install(io, "opencode-workspace-json", "files", local)).rejects.toThrow()
    await expect(provider.uninstall(io, "opencode-workspace-json", "files")).rejects.toThrow()
    await expect(setEnabled(io, "opencode-workspace-json", "workspace", "files", false)).rejects.toThrow()
    expect(writes).toEqual([])
  })

  it("names an editor refusal as its own failure and writes nothing", async () => {
    const { tools } = fakeTools({ editError: new Error("refused") })
    const provider = createOpenCodeMcp(tools)
    const { io, writes } = fakeIo({ text: "" })

    await expect(
      provider.install(io, "opencode-workspace-json", "files", local)
    ).rejects.toMatchObject({ key: "opencode.error.refused", params: { file: "opencode.json" } })
    expect(writes).toEqual([])
  })
})

describe("switching one server", () => {
  it("writes only the disabled field of an existing entry", async () => {
    const text = JSON.stringify({
      mcp: { servers: { files: { type: "local", command: ["node"], disabled: false } } },
    })
    const { tools, calls } = fakeTools()
    const provider = createOpenCodeMcp(tools)
    const { io, writes } = fakeIo({ text })
    const setEnabled = provider.setEnabled
    if (setEnabled === undefined) throw new Error("setEnabled is missing")

    await setEnabled(io, "opencode-workspace-json", "workspace", "files", false)

    expect(calls.edits).toEqual([
      { path: ["mcp", "servers", "files", "disabled"], value: true },
    ])
    expect(documentOf(writes[0]?.text ?? "")).toEqual({
      mcp: { servers: { files: { type: "local", command: ["node"], disabled: true } } },
    })
  })

  it("refuses to invent a server that the file does not declare", async () => {
    const { tools } = fakeTools()
    const provider = createOpenCodeMcp(tools)
    const { io, writes } = fakeIo({ text: JSON.stringify({ mcp: { servers: {} } }) })
    const setEnabled = provider.setEnabled
    if (setEnabled === undefined) throw new Error("setEnabled is missing")

    await expect(
      setEnabled(io, "opencode-workspace-json", "workspace", "files", true)
    ).rejects.toMatchObject({ key: "opencode.error.missingEntry", params: { name: "files" } })
    expect(writes).toEqual([])
  })

  it("refuses a scope that does not match the place", async () => {
    const { tools } = fakeTools()
    const provider = createOpenCodeMcp(tools)
    const { io, writes } = fakeIo({ text: "" })
    const setEnabled = provider.setEnabled
    if (setEnabled === undefined) throw new Error("setEnabled is missing")

    await expect(
      setEnabled(io, "opencode-global-jsonc", "workspace", "files", true)
    ).rejects.toMatchObject({ key: "opencode.error.scope" })
    expect(writes).toEqual([])
  })
})

describe("removing and locating one server", () => {
  it("takes out only the named server and keeps the file", async () => {
    const text = JSON.stringify({
      mcp: {
        servers: {
          files: { type: "local", command: ["node"] },
          other: { type: "local", command: ["other"] },
        },
      },
      theme: "dark",
    })
    const { tools, calls } = fakeTools()
    const provider = createOpenCodeMcp(tools)
    const { io, writes } = fakeIo({ text })

    await provider.uninstall(io, "opencode-workspace-json", "files")

    expect(calls.edits).toEqual([{ path: ["mcp", "servers", "files"], value: undefined }])
    expect(documentOf(writes[0]?.text ?? "")).toEqual({
      mcp: { servers: { other: { type: "local", command: ["other"] } } },
      theme: "dark",
    })
  })

  it("leaves a file or an entry that is not there alone", async () => {
    const { tools } = fakeTools()
    const provider = createOpenCodeMcp(tools)

    const absent = fakeIo({ text: null })
    await provider.uninstall(absent.io, "opencode-workspace-json", "files")
    expect(absent.writes).toEqual([])

    const other = fakeIo({
      text: JSON.stringify({ mcp: { servers: { other: { type: "local", command: ["node"] } } } }),
    })
    await provider.uninstall(other.io, "opencode-workspace-json", "files")
    expect(other.writes).toEqual([])
  })

  it("refuses to remove from a pre-V2 file", async () => {
    const text = JSON.stringify({
      mcp: { servers: { files: { type: "local", command: ["node"], enabled: true } } },
    })
    const { tools } = fakeTools()
    const provider = createOpenCodeMcp(tools)
    const { io, writes } = fakeIo({ text })

    await expect(
      provider.uninstall(io, "opencode-workspace-json", "files")
    ).rejects.toMatchObject({ key: "opencode.error.v2Only" })
    expect(writes).toEqual([])
  })

  it("locates the entry at the same path it writes", async () => {
    const { tools, calls } = fakeTools({ lines: [4, 9] })
    const provider = createOpenCodeMcp(tools)
    const locate = provider.locate
    if (locate === undefined) throw new Error("locate is missing")

    expect(await locate(fakeIo({ text: "{}" }).io, "opencode-dotdir-json", "files")).toEqual([
      4, 9,
    ])
    expect(calls.lines).toEqual([["mcp", "servers", "files"]])
    expect(await locate(fakeIo({ text: null }).io, "opencode-dotdir-json", "files")).toBeNull()
  })
})
