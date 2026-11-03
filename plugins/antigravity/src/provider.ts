import type { McpIo, McpProvider, McpTools } from "./contracts.ts"
import { ANTIGRAVITY_ID, GLOBAL_MCP, WORKSPACE_MCP } from "./locations.ts"

const files = {
  "antigravity-global": { scope: "global", file: GLOBAL_MCP },
  antigravity: { scope: "workspace", file: WORKSPACE_MCP },
} as const

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function createAntigravityMcp(tools: McpTools): McpProvider {
  const fileOf = (place: string) => {
    const file = Object.hasOwn(files, place) ? files[place as keyof typeof files] : undefined
    if (!file) throw new tools.McpError("antigravity.error.unknownPlace", { place })
    return file
  }
  const document = (text: string | null): Record<string, unknown> => {
    if (text === null) return {}
    if (text.trim() === "") throw new tools.McpError("antigravity.error.refused", undefined, "empty MCP configuration")
    try {
      const value = tools.parseJsonc(text)
      if (!object(value) || (value.mcpServers !== undefined && !object(value.mcpServers))) throw new Error("invalid mcpServers container")
      return value
    } catch (error) {
      throw new tools.McpError("antigravity.error.refused", undefined, String(error))
    }
  }
  const entry = (value: unknown, name: string) => {
    if (!object(value) || "url" in value || "httpUrl" in value ||
      ("command" in value && "serverUrl" in value) ||
      ("serverUrl" in value && (typeof value.serverUrl !== "string" || value.serverUrl === ""))) {
      throw new tools.McpError("antigravity.error.unsupported", { name })
    }
    const strings = (input: unknown) => object(input) && Object.values(input).every((item) => typeof item === "string")
    if (("args" in value && (!Array.isArray(value.args) || value.args.some((item) => typeof item !== "string"))) ||
      ("env" in value && !strings(value.env)) || ("headers" in value && !strings(value.headers))) throw new tools.McpError("antigravity.error.unsupported", { name })
    const translated = typeof value.serverUrl === "string" ? { ...value, url: value.serverUrl } : value
    const declaration = tools.readDeclaration(translated)
    if (!declaration) throw new tools.McpError("antigravity.error.unsupported", { name })
    return { value, declaration }
  }
  const load = async (io: McpIo, place: string) => {
    const file = fileOf(place)
    const text = await io.files.read(file)
    const doc = document(text)
    return { file, text, servers: (doc.mcpServers ?? {}) as Record<string, unknown> }
  }
  return {
    id: ANTIGRAVITY_ID,
    places: Object.entries(files).map(([id, file]) => ({ id, label: "Antigravity", switchable: true, ...file })),
    async read(io, place) {
      const { servers } = await load(io, place)
      return Object.entries(servers).map(([name, value]) => {
        const found = entry(value, name)
        return { name, declaration: found.declaration, enabled: found.value.disabled !== true }
      })
    },
    async install(io, place, name, declaration) {
      const { file, text, servers } = await load(io, place)
      const existing = servers[name] === undefined ? {} : entry(servers[name], name).value
      if (declaration.transport === "sse") throw new tools.McpError("antigravity.error.unsupported", { name })
      const next = { ...existing }
      for (const key of ["command", "args", "env", "serverUrl", "headers"]) delete next[key]
      const written = tools.writeDeclaration(declaration) as Record<string, unknown>
      if (declaration.transport === "http") {
        next.serverUrl = written.url
        if (written.headers !== undefined) next.headers = written.headers
      } else Object.assign(next, written)
      entry(next, name)
      const doc = document(text)
      const path = doc.mcpServers === undefined ? ["mcpServers"] : ["mcpServers", name]
      await io.files.write(file, tools.editJson(text, path, doc.mcpServers === undefined ? { [name]: next } : next))
    },
    async uninstall(io, place, name) {
      const { file, text, servers } = await load(io, place)
      if (servers[name] === undefined) return
      entry(servers[name], name)
      await io.files.write(file, tools.editJson(text, ["mcpServers", name], undefined))
    },
    async setEnabled(io, place, scope, name, enabled) {
      const { file, text, servers } = await load(io, place)
      if (scope !== file.scope || servers[name] === undefined) throw new tools.McpError("antigravity.error.unsupported", { name })
      entry(servers[name], name)
      await io.files.write(file, tools.editJson(text, ["mcpServers", name, "disabled"], !enabled))
    },
    async locate(io, place, name) {
      const { text } = await load(io, place)
      return text === null ? null : tools.jsonValueLines(text, ["mcpServers", name])
    },
  }
}
