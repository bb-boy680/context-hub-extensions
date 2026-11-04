import type { McpDeclaration, McpProvider, McpTools } from "./contracts.ts"
import { QWEN_ID, QWEN_MCP_FILE } from "./locations.ts"

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const strings = (value: unknown): boolean => object(value) && Object.values(value).every(item => typeof item === "string")
const managed = ["command", "args", "env", "httpUrl", "url", "headers"] as const

export function createQwenCodeMcp(tools: McpTools): McpProvider {
  const fileOf = (id: string) => {
    if (id === "qwen-code") return { scope: "workspace", file: QWEN_MCP_FILE } as const
    if (id === "qwen-code-global") return { scope: "global", file: QWEN_MCP_FILE } as const
    throw new tools.McpError("qwen-code.error.unknownPlace", { place: id })
  }
  const serversOf = (text: string | null): Record<string, unknown> => {
    if (text !== null && text.trim() === "") throw new tools.McpError("qwen-code.error.invalidMcp")
    const doc = tools.readJsonObject(text)
    const servers = doc?.mcpServers
    if (servers !== undefined && !object(servers)) throw new tools.McpError("qwen-code.error.invalidMcp")
    return servers ?? {}
  }
  const declarationOf = (value: unknown): McpDeclaration | null => {
    if (!object(value) || "type" in value || "transport" in value) return null
    const keys = ["command", "httpUrl", "url"].filter(key => Object.hasOwn(value, key))
    if (keys.length !== 1 || typeof value[keys[0]] !== "string" || !(value[keys[0]] as string).trim()) return null
    if (value.args !== undefined && (!Array.isArray(value.args) || !value.args.every(item => typeof item === "string"))) return null
    if (value.env !== undefined && !strings(value.env)) return null
    if (value.headers !== undefined && !strings(value.headers)) return null
    if (keys[0] === "command" && Object.hasOwn(value, "headers")) return null
    if (keys[0] !== "command" && (Object.hasOwn(value, "args") || Object.hasOwn(value, "env"))) return null
    if (keys[0] === "httpUrl") return tools.readDeclaration({ ...value, url: value.httpUrl, type: "http" })
    if (keys[0] === "url") return tools.readDeclaration({ ...value, type: "sse" })
    return tools.readDeclaration(value)
  }
  const valuesOf = (declaration: McpDeclaration): Record<string, unknown> => {
    const values = tools.writeDeclaration(declaration)
    if (declaration.transport === "http") {
      values.httpUrl = values.url
      delete values.url
    }
    return values
  }
  return {
    id: QWEN_ID,
    places: ["qwen-code", "qwen-code-global"].map(id => ({ id, label: "Qwen Code", switchable: false, ...fileOf(id) })),
    async read(io, place) {
      return Object.entries(serversOf(await io.files.read(fileOf(place)))).map(([name, value]) => ({ name, declaration: declarationOf(value), enabled: true }))
    },
    async install(io, place, name, declaration) {
      const file = fileOf(place)
      const text = await io.files.read(file)
      const servers = serversOf(text)
      const prior = Object.hasOwn(servers, name) ? servers[name] : undefined
      const previous = prior === undefined ? null : declarationOf(prior)
      if (prior !== undefined && (!previous || !object(prior))) throw new tools.McpError("qwen-code.error.mcpConflict")
      if (object(prior) && previous && previous.transport !== declaration.transport) {
        const conflicting = declaration.transport === "stdio" ? ["headers", "oauth"] : previous.transport === "stdio" ? ["cwd", "envFile"] : []
        if (conflicting.some(key => Object.hasOwn(prior, key))) throw new tools.McpError("qwen-code.error.mcpConflict")
      }
      const values = valuesOf(declaration)
      if (declarationOf(values)?.transport !== declaration.transport) throw new tools.McpError("qwen-code.error.mcpConflict")
      let next = text
      if (text !== null && tools.readJsonObject(text)?.mcpServers === undefined) next = tools.editJson(text, ["mcpServers"], {})
      if (object(prior)) {
        for (const key of managed) {
          if (Object.hasOwn(prior, key) || Object.hasOwn(values, key)) next = tools.editJson(next, ["mcpServers", name, key], values[key])
        }
      } else next = tools.editJson(next, ["mcpServers", name], values)
      await io.files.write(file, next!)
    },
    async uninstall(io, place, name) {
      const file = fileOf(place)
      const text = await io.files.read(file)
      const servers = serversOf(text)
      if (!Object.hasOwn(servers, name)) return
      if (!declarationOf(servers[name])) throw new tools.McpError("qwen-code.error.mcpConflict")
      await io.files.write(file, tools.editJson(text, ["mcpServers", name], undefined))
    },
    async locate(io, place, name) {
      const text = await io.files.read(fileOf(place))
      serversOf(text)
      return text === null ? null : tools.jsonValueLines(text, ["mcpServers", name])
    },
  }
}
