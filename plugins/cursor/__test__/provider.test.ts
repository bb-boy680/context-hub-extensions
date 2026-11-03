import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { promises as fs } from "node:fs"
import path from "node:path"
import { createCursorMcp } from "../src/provider.ts"
import { fixture, hostAvailable, mcpTools } from "./fixtures.ts"

let f: Awaited<ReturnType<typeof fixture>>
let provider: ReturnType<typeof createCursorMcp>
beforeEach(async () => { f = await fixture(); provider = createCursorMcp(mcpTools) })
afterEach(async () => { await f.cleanup() })
import type { McpDeclaration } from "../src/contracts.ts"
const stdio: McpDeclaration = { transport: "stdio", command: "node", args: ["${env:TOOL}"], env: { ROOT: "${workspaceFolder}" } }
const remote = { transport: "sse", url: "https://example.test/mcp", headers: {} } as const

describe.skipIf(!hostAvailable)("Cursor MCP", () => {
  it("uses separate scopes and preserves comments, unmodeled fields and variables", async () => {
    const file = path.join(f.workspace, ".cursor", "mcp.json")
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, '{\n  // keep comment\n  "mcpServers": {"demo": {"command":"old", "cwd":"keep", "envFile":".env"}, "other":{"url":"https://example.test"}},\n  "other": true\n}\n')
    await provider.install(f.mcpIo, "cursor", "demo", stdio)
    const text = await fs.readFile(file, "utf8")
    expect(text).toContain("// keep comment")
    expect(text).toContain('"cwd"')
    expect(text).toContain('"envFile"')
    expect(text).toContain("${workspaceFolder}")
    expect(text).toContain('"other"')
    expect(await provider.locate!(f.mcpIo, "cursor", "demo")).not.toBeNull()
    await expect(provider.install(f.mcpIo, "cursor", "demo", remote)).rejects.toThrow()
    expect(await fs.readFile(file, "utf8")).toBe(text)
    await provider.install(f.mcpIo, "cursor-global", "demo", remote)
    expect((await provider.read(f.mcpIo, "cursor-global"))[0]?.declaration.transport).toBe("sse")
    await provider.install(f.mcpIo, "cursor-global", "demo", { transport: "http", url: "https://example.test/http", headers: { token: "${env:TOKEN}" } })
    expect((await provider.read(f.mcpIo, "cursor-global"))[0]?.declaration.transport).toBe("http")
    expect((await provider.read(f.mcpIo, "cursor"))[0]?.declaration.transport).toBe("stdio")
    await provider.uninstall(f.mcpIo, "cursor-global", "demo")
    expect(await provider.read(f.mcpIo, "cursor-global")).toEqual([])
    expect(provider.setEnabled).toBeUndefined()
  })
  it("rejects invalid documents and unknown places without writes", async () => {
    const file = path.join(f.userHome, ".cursor", "mcp.json")
    await fs.mkdir(path.dirname(file), { recursive: true })
    for (const text of ['{"mcpServers": []}', '{ broken']) {
      await fs.writeFile(file, text)
      await expect(provider.install(f.mcpIo, "cursor-global", "demo", stdio)).rejects.toThrow()
      expect(await fs.readFile(file, "utf8")).toBe(text)
    }
    await expect(provider.read(f.mcpIo, "bad")).rejects.toThrow()
    const unknown = '{"mcpServers":{"demo":{"custom":"untouched"}}}'
    await fs.writeFile(file, unknown)
    await expect(provider.install(f.mcpIo, "cursor-global", "demo", stdio)).rejects.toThrow()
    expect(await fs.readFile(file, "utf8")).toBe(unknown)
  })
})
