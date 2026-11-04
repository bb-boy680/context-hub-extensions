import { describe, expect, it } from "vitest"
import { validatePlugin } from "../src/plugin-format.ts"

const schema = "https://agent-plugins.org/schemas/1.1.0"
const manifest = JSON.stringify({ $schema: `${schema}/plugin.schema.json`, name: "demo", version: "1.0" })
describe("Agent Plugins 1.1.0", () => {
  it("accepts the exact schema and preserves valid stdio placeholders", () => {
    const mcp = JSON.stringify({ $schema: `${schema}/mcp.schema.json`, mcpServers: { demo: { type: "stdio", command: "node", args: ["${PLUGIN_ROOT}/server.js"], cwd: "${PLUGIN_DATA}" } } })
    expect(validatePlugin(manifest, mcp, "demo")).toMatchObject({ name: "demo" })
  })
  it("rejects legacy manifests and invalid mcp before installation", () => {
    for (const raw of ['{"name":"demo"}', manifest.replace("1.1.0", "1.0.0"), manifest.replace('"demo"', '"other"')]) expect(() => validatePlugin(raw, null, "demo")).toThrow()
    for (const server of [{ type: "stdio", command: "x", env: { PLUGIN_ROOT: "x" } }, { type: "http", url: "https://example.com" }, { type: "stdio", command: "x", cwd: "/tmp" }]) {
      expect(() => validatePlugin(manifest, JSON.stringify({ $schema: `${schema}/mcp.schema.json`, mcpServers: { demo: server } }), "demo")).toThrow()
    }
  })
})
