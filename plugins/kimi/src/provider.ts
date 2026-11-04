import type { McpDeclaration, McpIo, McpProvider, McpTools } from "./contracts.ts"
import { KIMI_CODE_ID, KIMI_MCP_FILE } from "./locations.ts"

const places = [
  { id: "kimi-mcp-global", label: "Kimi Code", scope: "global" as const, file: KIMI_MCP_FILE, installable: true, switchable: true },
  { id: "kimi-mcp-project", label: "Kimi Code", scope: "workspace" as const, file: KIMI_MCP_FILE, installable: true, switchable: true },
]
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const owned = new Set(["command", "args", "env", "url", "headers", "transport", "enabled"])

export function createKimiMcp(tools: McpTools): McpProvider {
  const placeOf = (id: string) => {
    const place = places.find((item) => item.id === id)
    if (!place) throw new tools.McpError("kimi.error.unknownPlace", { place: id })
    return place
  }
  const read = async (io: McpIo, id: string) => {
    const place = placeOf(id)
    const text = await io.files.read({ scope: place.scope, file: place.file })
    let doc: Record<string, unknown> | null
    try { doc = tools.readJsonObject(text) } catch (error) {
      throw new tools.McpError("kimi.error.parse", { file: place.file }, String(error))
    }
    const servers = doc?.mcpServers
    if (servers !== undefined && !object(servers)) throw new tools.McpError("kimi.error.parse", { file: place.file })
    return { place, text, servers: servers as Record<string, unknown> | undefined }
  }
  const write = async (io: McpIo, place: typeof places[number], text: string) =>
    io.files.write({ scope: place.scope, file: place.file }, text)

  return {
    id: KIMI_CODE_ID,
    places,
    async read(io, place) {
      const { servers } = await read(io, place)
      return Object.entries(servers ?? {}).map(([name, entry]) => ({
        name, declaration: tools.readDeclaration(entry), enabled: !object(entry) || entry.enabled !== false,
      }))
    },
    async install(io, id, name, declaration: McpDeclaration) {
      const { place, text, servers } = await read(io, id)
      const prior = servers?.[name]
      if (prior !== undefined) {
        if (!object(prior)) throw new tools.McpError("kimi.error.invalidEntry", { name })
        const old = tools.readDeclaration(prior)
        if (old === null) throw new tools.McpError("kimi.error.invalidEntry", { name })
        if (old.transport !== declaration.transport && Object.keys(prior).some((key) => !owned.has(key))) {
          throw new tools.McpError("kimi.error.transport", { name })
        }
      }
      const path = ["mcpServers", name]
      const values: Record<string, unknown> = { ...tools.writeDeclaration(declaration), ...(declaration.transport === "sse" ? { transport: "sse" } : {}) }
      if (prior === undefined) {
        await write(io, place, tools.editJson(text, path, values))
      } else {
        let next = text
        for (const key of ["command", "args", "env", "url", "headers", "transport"]) {
          next = tools.editJson(next, [...path, key], values[key])
        }
        await write(io, place, next!)
      }
    },
    async uninstall(io, id, name) {
      const { place, text, servers } = await read(io, id)
      if (servers?.[name] === undefined) return
      await write(io, place, tools.editJson(text, ["mcpServers", name], undefined))
    },
    async setEnabled(io, id, scope, name, enabled) {
      const { place, text, servers } = await read(io, id)
      if (place.scope !== scope) throw new tools.McpError("kimi.error.scope", { place: id })
      if (!object(servers?.[name])) throw new tools.McpError("kimi.error.missingEntry", { name })
      await write(io, place, tools.editJson(text, ["mcpServers", name, "enabled"], enabled ? undefined : false))
    },
    async locate(io, id, name) {
      const { text } = await read(io, id)
      return text === null ? null : tools.jsonValueLines(text, ["mcpServers", name])
    },
  }
}
