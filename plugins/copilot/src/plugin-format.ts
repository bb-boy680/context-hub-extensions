const PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.1.0/plugin.schema.json"
const MCP_SCHEMA = "https://agent-plugins.org/schemas/1.1.0/mcp.schema.json"
export const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every((key) => allowed.includes(key))
const strings = (v: unknown) => object(v) && Object.values(v).every((item) => typeof item === "string")
const optionalString = (v: unknown) => v === undefined || typeof v === "string"

export function validatePlugin(text: string | null, mcp: string | null, expectedName: string): Record<string, unknown> {
  if (text === null) throw new Error("Missing plugin.json")
  const value: unknown = JSON.parse(text)
  if (!object(value) || value.$schema !== PLUGIN_SCHEMA || value.name !== expectedName || typeof value.name !== "string" || value.name.length > 64 || !/^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value.name) || !keys(value, ["$schema", "name", "version", "description", "author", "homepage", "repository", "license", "keywords", "extensions"])) throw new Error("Invalid Agent Plugins 1.1.0 manifest")
  if (![value.version, value.description, value.homepage, value.repository, value.license].every(optionalString) || (value.keywords !== undefined && (!Array.isArray(value.keywords) || !value.keywords.every((x) => typeof x === "string"))) || (value.author !== undefined && (!object(value.author) || !keys(value.author, ["name", "email", "url"]) || !Object.values(value.author).every((x) => typeof x === "string"))) || (value.extensions !== undefined && (!object(value.extensions) || !Object.values(value.extensions).every(object)))) throw new Error("Invalid Agent Plugins 1.1.0 manifest fields")
  if (mcp !== null) {
    const doc: unknown = JSON.parse(mcp)
    if (!object(doc) || doc.$schema !== MCP_SCHEMA || !keys(doc, ["$schema", "mcpServers"]) || !object(doc.mcpServers)) throw new Error("Invalid Agent Plugins 1.1.0 MCP file")
    for (const server of Object.values(doc.mcpServers)) {
      if (!object(server)) throw new Error("Invalid plugin MCP server")
      if (server.type === "stdio") {
        if (!keys(server, ["type", "command", "args", "env", "cwd"]) || typeof server.command !== "string" || !server.command || (server.args !== undefined && (!Array.isArray(server.args) || !server.args.every((v) => typeof v === "string"))) || (server.env !== undefined && (!strings(server.env) || Object.hasOwn(server.env as object, "PLUGIN_ROOT") || Object.hasOwn(server.env as object, "PLUGIN_DATA"))) || (server.cwd !== undefined && (typeof server.cwd !== "string" || !/^(?:\.\/|\$\{PLUGIN_ROOT\}(?:\/|$)|\$\{PLUGIN_DATA\}(?:\/|$))/.test(server.cwd)))) throw new Error("Invalid plugin stdio server")
      } else if (server.type === "streamable-http" || server.type === "sse") {
        if (!keys(server, ["type", "url", "headers"]) || typeof server.url !== "string" || !server.url || (server.headers !== undefined && !strings(server.headers))) throw new Error("Invalid plugin remote server")
      } else throw new Error("Unsupported plugin MCP transport")
    }
  }
  return value
}
