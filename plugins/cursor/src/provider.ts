import type { McpDeclaration, McpIo, McpProvider, McpTools } from "./contracts.ts"
import { CURSOR_ID, CURSOR_MCP_FILE } from "./locations.ts"

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function createCursorMcp(tools: McpTools): McpProvider {
  const fileOf = (id: string) => {
    if (id === "cursor") return { scope: "workspace", file: CURSOR_MCP_FILE } as const
    if (id === "cursor-global") return { scope: "global", file: CURSOR_MCP_FILE } as const
    throw new tools.McpError("cursor.error.unknownPlace", { place: id })
  }
  const readDocument = (text: string | null) => {
    const document = tools.readJsonObject(text)
    const servers = document?.mcpServers
    if (servers !== undefined && !isObject(servers)) throw new tools.McpError("cursor.error.invalidMcp")
    return servers ?? {}
  }
  const update = (existing: unknown, declaration: McpDeclaration): Record<string, unknown> => {
    if (existing !== undefined && !isObject(existing)) throw new tools.McpError("cursor.error.mcpConflict")
    if (existing !== undefined && !tools.readDeclaration(existing)) throw new tools.McpError("cursor.error.mcpConflict")
    const entry = { ...(existing ?? {}) }
    const priorUsesStdio = typeof entry.command === "string" || entry.type === "stdio"
    const priorUsesRemote = typeof entry.url === "string" || entry.type === "http" || entry.type === "sse"
    if ((declaration.transport === "stdio" && priorUsesRemote && Object.hasOwn(entry, "auth")) ||
        (declaration.transport !== "stdio" && priorUsesStdio && ["cwd", "envFile"].some((key) => Object.hasOwn(entry, key)))) {
      throw new tools.McpError("cursor.error.mcpConflict")
    }
    for (const key of ["type", "transport", "command", "args", "env", "url", "headers"]) delete entry[key]
    return { ...entry, ...tools.writeDeclaration(declaration), type: declaration.transport }
  }
  return {
    id: CURSOR_ID,
    places: [
      { id: "cursor", label: "Cursor", switchable: false, ...fileOf("cursor") },
      { id: "cursor-global", label: "Cursor", switchable: false, ...fileOf("cursor-global") },
    ],
    async read(io, place) {
      const servers = readDocument(await io.files.read(fileOf(place)))
      return Object.entries(servers).flatMap(([name, value]) => {
        const declaration = tools.readDeclaration(value)
        return declaration ? [{ name, declaration, enabled: true }] : []
      })
    },
    async install(io, place, name, declaration) {
      const file = fileOf(place)
      const text = await io.files.read(file)
      const servers = readDocument(text)
      const value = update(Object.hasOwn(servers, name) ? servers[name] : undefined, declaration)
      const nextValues = tools.writeDeclaration(declaration)
      let next = text
      if (text !== null && text.trim() !== "" && tools.valueAt(tools.readJsonObject(text), ["mcpServers"]) === undefined) {
        next = tools.editJson(text, ["mcpServers"], {})
      }
      if (Object.hasOwn(servers, name) && isObject(servers[name])) {
        const prior = servers[name]
        for (const key of ["type", "transport", "command", "args", "env", "url", "headers"]) {
          const nextValue = Object.hasOwn(nextValues, key) ? nextValues[key] : key === "type" ? declaration.transport : undefined
          if (Object.hasOwn(prior, key) || nextValue !== undefined) next = tools.editJson(next, ["mcpServers", name, key], nextValue)
        }
      } else {
        next = tools.editJson(next, ["mcpServers", name], value)
      }
      await io.files.write(file, next ?? "")
    },
    async uninstall(io: McpIo, place: string, name: string) {
      const file = fileOf(place)
      const text = await io.files.read(file)
      const servers = readDocument(text)
      if (!Object.hasOwn(servers, name)) return
      await io.files.write(file, tools.editJson(text, ["mcpServers", name], undefined))
    },
    async locate(io, place, name) {
      const text = await io.files.read(fileOf(place))
      readDocument(text)
      return text === null ? null : tools.jsonValueLines(text, ["mcpServers", name])
    },
  }
}
