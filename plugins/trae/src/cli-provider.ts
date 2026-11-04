import type { McpDeclaration, McpProvider, McpTools } from "./contracts.ts"
import { CLI_ID, CLI_MCP } from "./locations.ts"

const PLACE = "trae-cli-mcp-global"
const FILE = { scope: "global", file: CLI_MCP } as const
const TABLE = "mcp_servers"
const UNSUPPORTED = [
  "env", "url", "headers", "type", "transport", "oauth", "auth", "authorization",
  "bearer_token_env_var", "bearer_token", "auth_token", "api_key",
]

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
function strings(value: unknown): value is Record<string, string> {
  return object(value) && Object.values(value).every((item) => typeof item === "string")
}
function declarationOf(entry: unknown): McpDeclaration | null {
  if (!object(entry) || UNSUPPORTED.some((key) => key in entry)) return null
  if (typeof entry.command !== "string" || entry.command === "") return null
  if (entry.args !== undefined && (!Array.isArray(entry.args) || !entry.args.every((arg) => typeof arg === "string"))) return null
  return { transport: "stdio", command: entry.command, args: (entry.args ?? []) as string[], env: {} }
}

export function createTraeCliMcp(tools: McpTools): McpProvider {
  const { McpError } = tools
  const assertPlace = (place: string) => {
    if (place !== PLACE) throw new McpError("trae.error.unknownPlace", { place })
  }
  const tableOf = (text: string) => {
    let document: Record<string, unknown>
    try { document = tools.parseToml(text) } catch (error) {
      throw new McpError("trae.error.parse", { file: CLI_MCP }, String(error))
    }
    const table = document[TABLE]
    if (table === undefined) return {}
    if (!object(table)) throw new McpError("trae.error.invalid", { file: CLI_MCP })
    return table
  }
  const editable = (entry: unknown, name: string) => {
    if (entry === undefined) return {}
    if (!object(entry) || declarationOf(entry) === null) throw new McpError("trae.error.invalidEntry", { name })
    const values: Record<string, string | boolean | string[] | Record<string, string>> = {}
    for (const [key, value] of Object.entries(entry)) {
      if (typeof value === "string" || typeof value === "boolean" ||
          (Array.isArray(value) && value.every((item) => typeof item === "string")) || strings(value)) {
        values[key] = value as string | boolean | string[] | Record<string, string>
      } else throw new McpError("trae.error.invalidEntry", { name })
    }
    return values
  }
  return {
    id: CLI_ID,
    places: [{ id: PLACE, label: "TRAE CLI 2.0", switchable: false, ...FILE }],
    async read(io, place) {
      assertPlace(place)
      const table = tableOf((await io.files.read(FILE)) ?? "")
      return Object.entries(table).map(([name, entry]) => {
        if (!object(entry)) throw new McpError("trae.error.invalidEntry", { name })
        return { name, declaration: declarationOf(entry), enabled: true }
      })
    },
    async install(io, place, name, declaration) {
      assertPlace(place)
      if (declaration.transport !== "stdio") throw new McpError("trae.error.stdioOnly")
      if (Object.keys(declaration.env).length) throw new McpError("trae.error.env")
      if (!declaration.command) throw new McpError("trae.error.command")
      const text = (await io.files.read(FILE)) ?? ""
      const values = editable(tableOf(text)[name], name)
      values.command = declaration.command
      if (declaration.args.length) values.args = declaration.args
      else delete values.args
      let next: string
      try { next = tools.setTomlEntry(text, TABLE, name, values) } catch (error) {
        throw new McpError("trae.error.refused", { file: CLI_MCP }, String(error))
      }
      if (next !== text) await io.files.write(FILE, next)
    },
    async uninstall(io, place, name) {
      assertPlace(place)
      const text = (await io.files.read(FILE)) ?? ""
      const entry = tableOf(text)[name]
      if (entry === undefined) return
      editable(entry, name)
      let next: string
      try { next = tools.clearTomlEntry(text, TABLE, name) } catch (error) {
        throw new McpError("trae.error.refused", { file: CLI_MCP }, String(error))
      }
      if (next !== text) await io.files.write(FILE, next)
    },
    async locate(io, place, name) {
      assertPlace(place)
      const text = await io.files.read(FILE)
      if (text === null) return null
      tableOf(text)
      return tools.tomlEntryLines(text, TABLE, name)
    },
  }
}
