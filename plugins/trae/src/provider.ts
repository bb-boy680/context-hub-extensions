import type { McpDeclaration, McpProvider, McpTools } from "./contracts.ts"
import { IDE_ID, IDE_MCP } from "./locations.ts"

const IDE_PLACE = "trae-ide-mcp"
const IDE_FILE = { scope: "workspace", file: IDE_MCP } as const

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function strings(value: unknown): value is Record<string, string> {
  return object(value) && Object.values(value).every((item) => typeof item === "string")
}

function declarationOf(entry: unknown): McpDeclaration | null {
  if (!object(entry) || ("command" in entry && "url" in entry) ||
      ["type", "transport", "oauth", "cwd", "enabled", "disabled", "autoApprove", "auth", "authorization", "bearer_token_env_var"].some((key) => key in entry)) return null
  if (typeof entry.command === "string" && entry.command !== "" && !/\s/.test(entry.command) &&
      (entry.args === undefined || (Array.isArray(entry.args) && entry.args.every((item) => typeof item === "string"))) &&
      (entry.env === undefined || strings(entry.env)) && !("headers" in entry)) {
    return { transport: "stdio", command: entry.command, args: (entry.args ?? []) as string[], env: (entry.env ?? {}) as Record<string, string> }
  }
  if (typeof entry.url === "string" && entry.url !== "" &&
      (entry.headers === undefined || strings(entry.headers)) && !("args" in entry) && !("env" in entry)) {
    return { transport: "http", url: entry.url, headers: (entry.headers ?? {}) as Record<string, string> }
  }
  return null
}

export function createTraeIdeMcp(tools: McpTools): McpProvider {
  const { McpError } = tools
  const assertPlace = (place: string) => {
    if (place !== IDE_PLACE) throw new McpError("trae.error.unknownPlace", { place })
  }
  const serversOf = (text: string | null): Record<string, unknown> => {
    let document: Record<string, unknown> | null
    try { document = tools.readJsonObject(text) } catch (error) {
      throw new McpError("trae.error.parse", { file: IDE_MCP }, String(error))
    }
    const servers = document?.mcpServers
    if (servers === undefined) return {}
    if (!object(servers)) throw new McpError("trae.error.invalid", { file: IDE_MCP })
    return servers
  }
  const targetOf = (servers: Record<string, unknown>, name: string) => {
    const entry = servers[name]
    if (entry === undefined) return undefined
    if (!object(entry) || declarationOf(entry) === null) {
      throw new McpError("trae.error.invalidEntry", { name })
    }
    return entry
  }
  const edit = (text: string | null, path: string[], value: unknown) => {
    try { return tools.editJson(text, path, value) } catch (error) {
      throw new McpError("trae.error.refused", { file: IDE_MCP }, String(error))
    }
  }
  return {
    id: IDE_ID,
    places: [{ id: IDE_PLACE, label: "Trae IDE (CN)", switchable: false, ...IDE_FILE }],
    async read(io, place) {
      assertPlace(place)
      const servers = serversOf(await io.files.read(IDE_FILE))
      return Object.entries(servers).map(([name, entry]) => {
        const declaration = declarationOf(entry)
        if (declaration === null) throw new McpError("trae.error.invalidEntry", { name })
        return { name, declaration, enabled: true }
      })
    },
    async install(io, place, name, declaration) {
      assertPlace(place)
      if (declaration.transport === "sse") throw new McpError("trae.error.sse")
      if (declaration.transport === "stdio" && (declaration.command === "" || /\s/.test(declaration.command))) {
        throw new McpError("trae.error.command")
      }
      if (declaration.transport === "http" && declaration.url === "") throw new McpError("trae.error.invalidEntry", { name })
      const text = await io.files.read(IDE_FILE)
      const existing = targetOf(serversOf(text), name)
      const path = ["mcpServers", name]
      const values: Record<string, unknown> = declaration.transport === "stdio"
        ? { command: declaration.command, args: declaration.args.length ? declaration.args : undefined, env: Object.keys(declaration.env).length ? declaration.env : undefined, url: undefined, headers: undefined }
        : { url: declaration.url, headers: Object.keys(declaration.headers).length ? declaration.headers : undefined, command: undefined, args: undefined, env: undefined }
      let next = text
      if (existing === undefined) {
        next = edit(next, path, Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)))
      } else {
        for (const [key, value] of Object.entries(values)) next = edit(next, [...path, key], value)
      }
      if (next !== null && next !== text) await io.files.write(IDE_FILE, next)
    },
    async uninstall(io, place, name) {
      assertPlace(place)
      const text = await io.files.read(IDE_FILE)
      if (targetOf(serversOf(text), name) === undefined) return
      await io.files.write(IDE_FILE, edit(text, ["mcpServers", name], undefined))
    },
    async locate(io, place, name) {
      assertPlace(place)
      const text = await io.files.read(IDE_FILE)
      serversOf(text)
      return text === null ? null : tools.jsonValueLines(text, ["mcpServers", name])
    },
  }
}
