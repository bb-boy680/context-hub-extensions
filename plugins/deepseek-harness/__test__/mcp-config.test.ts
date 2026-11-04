import { describe, expect, it } from "vitest"
import { readMcpConfig, validServerName, writeMcpConfig } from "../src/mcp-config.ts"

const stdio = { transport: "stdio" as const, command: "node", args: ["server.js"], env: { MODE: "test" } }
const http = { transport: "http" as const, url: "https://example.test/mcp", headers: { Accept: "application/json" } }

describe("DeepSeek MCP configuration mapping", () => {
  it("round-trips both supported transports with their official field names", () => {
    const local = writeMcpConfig("server_1", stdio)!
    const remote = writeMcpConfig("server-2", http)!
    expect(local).toEqual({ serverName: "server_1", ...stdio })
    expect(remote).toEqual({ serverName: "server-2", ...http, transport: "streamable-http" })
    expect(readMcpConfig(local)).toEqual(stdio)
    expect(readMcpConfig(remote)).toEqual(http)
    expect(readMcpConfig({ transport: "stdio", command: "node" })).toEqual({ transport: "stdio", command: "node", args: [], env: {} })
  })

  it("rejects invalid names, unsupported transports and malformed literal fields", () => {
    expect(["", "has space", "名字", "x".repeat(33)].every((name) => !validServerName(name))).toBe(true)
    expect(validServerName("a_1-Z")).toBe(true)
    expect(validServerName(null as never)).toBe(false)
    expect(writeMcpConfig("name", { ...http, transport: "sse" })).toBeNull()
    expect(writeMcpConfig("name", { transport: "stdio", command: "node", args: undefined, env: {} } as never)).toBeNull()
    expect(writeMcpConfig("name", { transport: "http", url: "url", headers: undefined } as never)).toBeNull()
    expect(readMcpConfig({ transport: "stdio", command: "", args: [], env: {} })).toBeNull()
    expect(readMcpConfig({ transport: "stdio", command: "node", args: [1] })).toBeNull()
    expect(readMcpConfig({ transport: "streamable-http", url: "url", headers: { Authorization: 12 } })).toBeNull()
  })
})
