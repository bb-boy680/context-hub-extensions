import { describe, expect, it } from "vitest"
import { createCopilotMcp } from "../src/provider.ts"
import type { McpTools } from "../src/contracts.ts"

class McpError extends Error {}
const readJsonObject = (text: string | null) => text?.trim() ? JSON.parse(text) : null
const editJson = (text: string, path: string[], value: unknown) => {
  const doc = readJsonObject(text) ?? {}; let cursor = doc
  for (const key of path.slice(0, -1)) cursor = cursor[key] ??= {}
  if (value === undefined) delete cursor[path.at(-1)!]; else cursor[path.at(-1)!] = value
  return JSON.stringify(doc)
}
const provider = createCopilotMcp({ readJsonObject, editJson, jsonValueLines: () => [1, 1], readDeclaration: (v: unknown) => v, writeDeclaration: (v: { command: string }) => ({ command: v.command }), McpError } as unknown as McpTools)
function memory() {
  const files = new Map<string, string>()
  const io = { files: { read: async (ref: { scope: string; file: string }) => files.get(`${ref.scope}:${ref.file}`) ?? null, write: async (ref: { scope: string; file: string }, value: string) => { files.set(`${ref.scope}:${ref.file}`, value) } }, log: () => {} }
  return { files, io }
}
const stdio = { transport: "stdio", command: "node", args: [], env: {} }
describe("Copilot MCP", () => {
  it("writes each envelope and retains unrelated fields", async () => {
    const { files, io } = memory()
    files.set("workspace:.vscode/mcp.json", '{"inputs":[],"servers":{"demo":{"type":"stdio","command":"old","cwd":"here"}}}')
    await provider.install(io, "copilot-mcp-vscode", "demo", stdio)
    const text = files.get("workspace:.vscode/mcp.json")!
    expect(readJsonObject(text)).toMatchObject({ inputs: [], servers: { demo: { command: "node", cwd: "here", type: "stdio" } } })
    expect((await provider.read(io, "copilot-mcp-vscode"))[0]?.declaration).toBeNull()
    await provider.uninstall(io, "copilot-mcp-vscode", "demo")
    expect(readJsonObject(files.get("workspace:.vscode/mcp.json")!)).toMatchObject({ inputs: [], servers: {} })
    await provider.install(io, "copilot-mcp", "demo", stdio)
    expect(readJsonObject(files.get("workspace:.mcp.json")!)).toMatchObject({ mcpServers: { demo: { type: "stdio" } } })
  })
  it("refuses bare maps and legacy entries without writes", async () => {
    const { files, io } = memory()
    const bare = '{"demo":{"command":"node"}}'
    files.set("workspace:.mcp.json", bare)
    await expect(provider.install(io, "copilot-mcp", "demo", stdio)).rejects.toThrow()
    expect(files.get("workspace:.mcp.json")).toBe(bare)
    const legacy = '{"mcpServers":{"demo":{"type":"local","command":"old"}}}'
    files.set("workspace:.mcp.json", legacy)
    await expect(provider.install(io, "copilot-mcp", "demo", stdio)).rejects.toThrow()
    expect(files.get("workspace:.mcp.json")).toBe(legacy)
  })
})
