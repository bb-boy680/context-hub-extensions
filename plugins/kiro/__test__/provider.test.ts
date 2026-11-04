import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { promises as fs } from "node:fs"
import path from "node:path"
import { createKiroMcp } from "../src/provider.ts"
import { fixture, hostAvailable, mcpTools } from "./fixtures.ts"
import type { McpDeclaration } from "../src/contracts.ts"

let f: Awaited<ReturnType<typeof fixture>>
let provider: ReturnType<typeof createKiroMcp>
const stdio: McpDeclaration = { transport: "stdio", command: "node", args: ["${TOOL}"], env: { TOKEN: "${TOKEN}" } }
const http: McpDeclaration = { transport: "http", url: "https://example.test/mcp", headers: { Authorization: "${TOKEN}" } }

describe.skipIf(!hostAvailable)("Kiro MCP", () => {
  beforeEach(async () => { f = await fixture(); provider = createKiroMcp(mcpTools) })
  afterEach(async () => { await f.cleanup() })

  it("keeps independent scopes and preserves comments, powers and other fields", async () => {
    const file = path.join(f.workspace, ".kiro", "settings", "mcp.json")
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, '{\n  // keep comment\n  "mcpServers": {"demo": {"command": "old", "disabled": true, "autoApprove": ["x"], "disabledTools": ["y"]}, "other": {"url":"https://example.test"}},\n  "powers": {"untouched": true}\n}\n')
    await provider.install(f.mcpIo, "kiro", "demo", stdio)
    const text = await fs.readFile(file, "utf8")
    for (const value of ["// keep comment", "autoApprove", "disabledTools", "powers", "${TOKEN}"]) expect(text).toContain(value)
    expect((await provider.read(f.mcpIo, "kiro"))[0]?.enabled).toBe(false)
    expect(await provider.locate!(f.mcpIo, "kiro", "demo")).not.toBeNull()
    await provider.install(f.mcpIo, "kiro-global", "demo", http)
    expect((await provider.read(f.mcpIo, "kiro-global"))[0]?.declaration).toEqual(http)
    await provider.setEnabled!(f.mcpIo, "kiro-global", "global", "demo", false)
    expect((await provider.read(f.mcpIo, "kiro-global"))[0]?.enabled).toBe(false)
    expect(await fs.readFile(file, "utf8")).toBe(text)
    await expect(provider.install(f.mcpIo, "kiro", "demo", http)).rejects.toThrow()
    expect(await fs.readFile(file, "utf8")).toBe(text)
    await provider.uninstall(f.mcpIo, "kiro", "demo")
    const after = await fs.readFile(file, "utf8")
    expect(after).toContain("powers")
    expect(after).toContain('"other"')
    expect(after).not.toContain('"demo"')
  })

  it("rejects invalid files, mismatched scopes and unsupported SSE without writes", async () => {
    const file = path.join(f.userHome, ".kiro", "settings", "mcp.json")
    await fs.mkdir(path.dirname(file), { recursive: true })
    const invalid = [" ", "{broken", '{"mcpServers":[]}', '{"mcpServers":{"demo":3}}', '{"mcpServers":{"demo":{"command":"a","disabled":"no"}}}', '{"mcpServers":{"demo":{"command":"a","url":"https://example.test"}}}', '{"mcpServers":{"demo":{"custom":true}}}']
    for (const text of invalid) {
      await fs.writeFile(file, text)
      await expect(provider.install(f.mcpIo, "kiro-global", "demo", stdio)).rejects.toThrow()
      expect(await fs.readFile(file, "utf8")).toBe(text)
    }
    const text = '{"mcpServers":{}}'
    await fs.writeFile(file, text)
    await expect(provider.install(f.mcpIo, "kiro-global", "demo", { transport: "sse", url: "https://example.test", headers: {} })).rejects.toThrow()
    await expect(provider.setEnabled!(f.mcpIo, "kiro-global", "global", "missing", true)).rejects.toThrow()
    await expect(provider.setEnabled!(f.mcpIo, "kiro-global", "workspace", "missing", true)).rejects.toThrow()
    expect(await fs.readFile(file, "utf8")).toBe(text)
  })

  it("preserves a remote server's env and unrelated fields when updating", async () => {
    const file = path.join(f.userHome, ".kiro", "settings", "mcp.json")
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, '{"mcpServers":{"demo":{"url":"https://old.test", "env":{"X":"${X}"}, "oauth":{"scope":"x"}}}}')
    await provider.install(f.mcpIo, "kiro-global", "demo", http)
    const text = await fs.readFile(file, "utf8")
    expect(text).toContain("${X}")
    expect(text).toContain("oauth")
    expect((await provider.read(f.mcpIo, "kiro-global"))[0]?.declaration).toEqual(http)
  })
})
