import type { McpDeclaration, McpProvider, McpTools } from "./contracts.ts"
import { KIRO_ID, MCP_FILE } from "./locations.ts"

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function createKiroMcp(tools: McpTools): McpProvider {
  const fileOf = (id: string) => {
    if (id === "kiro") return { scope: "workspace", file: MCP_FILE } as const
    if (id === "kiro-global") return { scope: "global", file: MCP_FILE } as const
    throw new tools.McpError("kiro.error.unknownPlace", { place: id })
  }
  const validateEntry = (value: unknown): McpDeclaration => {
    if (!isObject(value) || (value.disabled !== undefined && typeof value.disabled !== "boolean") ||
        (Object.hasOwn(value, "command") && Object.hasOwn(value, "url"))) throw new tools.McpError("kiro.error.mcpConflict")
    const declaration = tools.readDeclaration(value)
    if (!declaration || declaration.transport === "sse") throw new tools.McpError("kiro.error.mcpConflict")
    if (value.args !== undefined && (!Array.isArray(value.args) || !value.args.every((item) => typeof item === "string"))) throw new tools.McpError("kiro.error.mcpConflict")
    for (const key of ["env", "headers"]) {
      if (value[key] !== undefined && (!isObject(value[key]) || !Object.values(value[key]).every((item) => typeof item === "string"))) throw new tools.McpError("kiro.error.mcpConflict")
    }
    return declaration
  }
  const serversOf = (text: string | null) => {
    if (text !== null && text.trim() === "") throw new tools.McpError("kiro.error.invalidMcp")
    const document = tools.readJsonObject(text)
    const servers = document?.mcpServers
    if (servers !== undefined && !isObject(servers)) throw new tools.McpError("kiro.error.invalidMcp")
    const result = servers ?? {}
    for (const value of Object.values(result)) validateEntry(value)
    return result
  }
  return {
    id: KIRO_ID,
    places: [
      { id: "kiro", label: "Kiro", switchable: true, ...fileOf("kiro") },
      { id: "kiro-global", label: "Kiro", switchable: true, ...fileOf("kiro-global") },
    ],
    async read(io, place) {
      const servers = serversOf(await io.files.read(fileOf(place)))
      return Object.entries(servers).map(([name, value]) => ({ name, declaration: validateEntry(value), enabled: (value as Record<string, unknown>).disabled !== true }))
    },
    async install(io, place, name, declaration) {
      const file = fileOf(place)
      if (declaration.transport === "sse") throw new tools.McpError("kiro.error.unsupportedSse")
      const text = await io.files.read(file)
      const servers = serversOf(text)
      const existing = Object.hasOwn(servers, name) ? servers[name] : undefined
      if (existing !== undefined && validateEntry(existing).transport !== declaration.transport) throw new tools.McpError("kiro.error.mcpConflict")
      const values = tools.writeDeclaration(declaration)
      let next = text
      if (text !== null && !Object.hasOwn(tools.readJsonObject(text) ?? {}, "mcpServers")) next = tools.editJson(text, ["mcpServers"], {})
      if (existing === undefined) {
        next = tools.editJson(next, ["mcpServers", name], { ...values, disabled: false })
      } else {
        const keys = declaration.transport === "stdio" ? ["command", "args", "env"] : ["url", "headers"]
        for (const key of keys) {
          if (Object.hasOwn(existing as object, key) || Object.hasOwn(values, key)) next = tools.editJson(next, ["mcpServers", name, key], values[key])
        }
      }
      await io.files.write(file, next ?? "")
    },
    async uninstall(io, place, name) {
      const file = fileOf(place)
      const text = await io.files.read(file)
      const servers = serversOf(text)
      if (!Object.hasOwn(servers, name)) return
      await io.files.write(file, tools.editJson(text, ["mcpServers", name], undefined))
    },
    async setEnabled(io, place, scope, name, enabled) {
      const file = fileOf(place)
      if (scope !== file.scope) throw new tools.McpError("kiro.error.unknownPlace", { place })
      const text = await io.files.read(file)
      const servers = serversOf(text)
      if (!Object.hasOwn(servers, name)) throw new tools.McpError("kiro.error.mcpConflict")
      await io.files.write(file, tools.editJson(text, ["mcpServers", name, "disabled"], !enabled))
    },
    async locate(io, place, name) {
      const text = await io.files.read(fileOf(place))
      serversOf(text)
      return text === null ? null : tools.jsonValueLines(text, ["mcpServers", name])
    },
  }
}
