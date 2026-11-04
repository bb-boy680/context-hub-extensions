import { describe, expect, it } from "vitest"
import { createWorkBuddyMcp } from "../src/provider.ts"

class McpError extends Error {
  constructor(readonly key: string) { super(key) }
}
const tools = {
  McpError,
  readJsonObject: (text: string | null) => text ? JSON.parse(text) : null,
  readDeclaration: (entry: Record<string, unknown>) => ({ transport: "stdio", command: entry.command, args: entry.args ?? [], env: entry.env ?? {} }),
  writeDeclaration: (entry: { command: string; args: string[]; env: Record<string, string> }) => ({ command: entry.command, args: entry.args, env: entry.env }),
  editJson: (text: string | null, path: string[], value: unknown) => {
    const root = text ? JSON.parse(text) : {}
    let node = root
    for (const key of path.slice(0, -1)) node = node[key] ??= {}
    if (value === undefined) delete node[path.at(-1)!]
    else node[path.at(-1)!] = value
    return JSON.stringify(root)
  },
  jsonValueLines: () => "1",
}
const provider = createWorkBuddyMcp(tools)
const decl = { transport: "stdio", command: "node", args: ["server.js"], env: {} }

function fixture(seed: Record<string, string> = {}) {
  const files = new Map(Object.entries(seed))
  const key = (ref: { scope: string; file: string }) => `${ref.scope}:${ref.file}`
  return { files, io: { files: {
    read: async (ref: { scope: string; file: string }) => files.get(key(ref)) ?? null,
    write: async (ref: { scope: string; file: string }, text: string) => { files.set(key(ref), text) },
  } } }
}

describe("WorkBuddy MCP", () => {
  it("writes stdio to the selected scope and preserves unowned fields", async () => {
    const k = "global:.workbuddy/mcp.json"
    const { io, files } = fixture({ [k]: JSON.stringify({ other: 4, mcpServers: { test: { command: "old", disabled: true, custom: 2 }, keep: { command: "keep" } } }) })
    await provider.install(io, "workbuddy-global", "test", decl)
    expect(JSON.parse(files.get(k)!)).toMatchObject({ other: 4, mcpServers: { test: { command: "node", disabled: true, custom: 2 }, keep: { command: "keep" } } })
    await provider.install(io, "workbuddy", "another", decl)
    expect(files.has("workspace:.workbuddy/mcp.json")).toBe(true)
    await provider.uninstall(io, "workbuddy-global", "test")
    expect(JSON.parse(files.get(k)!).mcpServers).toEqual({ keep: { command: "keep" } })
  })
  it("refuses unsupported transport, malformed documents and unsupported targets without writes", async () => {
    const k = "global:.workbuddy/mcp.json"
    const text = JSON.stringify({ mcpServers: { remote: { url: "https://example.com" } } })
    const { io, files } = fixture({ [k]: text })
    await expect(provider.install(io, "workbuddy-global", "remote", decl)).rejects.toThrow()
    await expect(provider.install(io, "workbuddy-global", "test", { transport: "http" })).rejects.toThrow()
    expect(files.get(k)).toBe(text)
    files.set(k, "{")
    await expect(provider.uninstall(io, "workbuddy-global", "remote")).rejects.toThrow()
    expect(files.get(k)).toBe("{")
  })
})
