import type { McpIo, McpProvider, McpTools } from "./contracts.ts"
import { COPILOT_ID } from "./locations.ts"

const places = [
  { id: "copilot-mcp-global", label: "Copilot", scope: "global", file: ".copilot/mcp-config.json", switchable: false, key: "mcpServers" },
  { id: "copilot-mcp", label: "Copilot", scope: "workspace", file: ".mcp.json", switchable: false, key: "mcpServers" },
  { id: "copilot-mcp-github", label: "Copilot CLI", scope: "workspace", file: ".github/mcp.json", switchable: false, key: "mcpServers" },
  { id: "copilot-mcp-vscode", label: "VS Code Local", scope: "workspace", file: ".vscode/mcp.json", switchable: false, key: "servers" },
] as const
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)

export function createCopilotMcp(tools: McpTools): McpProvider {
  const placeOf = (id: string) => {
    const place = places.find((p) => p.id === id)
    if (!place) throw new tools.McpError("copilot.error.unknownPlace", { place: id })
    return place
  }
  const document = (text: string | null, key: string): Record<string, unknown> => {
    const doc = tools.readJsonObject(text) ?? {}
    if (doc[key] !== undefined && !object(doc[key])) throw new tools.McpError("copilot.error.invalidEnvelope")
    const entryKeys = ["command", "url", "type", "args", "env", "headers"]
    const bare = Object.entries(doc).some(([name, value]) => ![key, "inputs", "sandbox", "$schema"].includes(name) && object(value) && (Object.keys(value).length === 0 || Object.keys(value).some((key) => entryKeys.includes(key))))
    if (bare) throw new tools.McpError("copilot.error.invalidEnvelope")
    return doc
  }
  const contents = async (io: McpIo, id: string) => {
    const place = placeOf(id)
    const text = await io.files.read(place)
    const doc = document(text, place.key)
    return { place, text: text ?? "", entries: object(doc[place.key]) ? doc[place.key] as Record<string, unknown> : {} }
  }
  const known = (entry: unknown): boolean => {
    if (!object(entry) || !["stdio", "http", "sse"].includes(String(entry.type ?? "stdio"))) return false
    if (entry.args !== undefined && (!Array.isArray(entry.args) || !entry.args.every((v) => typeof v === "string"))) return false
    for (const key of ["env", "headers"]) {
      const value = entry[key]
      if (value !== undefined && (!object(value) || !Object.values(value).every((v) => typeof v === "string"))) return false
    }
    const allowed = ["type", "command", "args", "env", "url", "headers"]
    return Object.keys(entry).every((key) => allowed.includes(key))
  }
  return {
    id: COPILOT_ID,
    places,
    async read(io, id) {
      const { entries } = await contents(io, id)
      return Object.entries(entries).map(([name, entry]) => ({ name, declaration: known(entry) ? tools.readDeclaration(entry) : null, enabled: true }))
    },
    async install(io, id, name, declaration) {
      const { place, text, entries } = await contents(io, id)
      const previous = entries[name]
      if (previous !== undefined && (!object(previous) || previous.type === "local" || !["stdio", "http", "sse"].includes(String(previous.type ?? "stdio")))) throw new tools.McpError("copilot.error.unsupportedEntry", { name })
      const values = tools.writeDeclaration(declaration) as Record<string, unknown>
      const extras = object(previous) ? { ...previous } : {}
      for (const key of ["type", "command", "args", "env", "url", "headers"]) delete extras[key]
      const next = { ...extras, ...values, type: declaration.transport }
      const prepared = tools.readJsonObject(text) === null || tools.readJsonObject(text)?.[place.key] !== undefined ? text : tools.editJson(text, [place.key], {})
      await io.files.write(place, tools.editJson(prepared, [place.key, name], next))
    },
    async uninstall(io, id, name) {
      const { place, text, entries } = await contents(io, id)
      if (entries[name] !== undefined && (!object(entries[name]) || !["stdio", "http", "sse"].includes(String(entries[name].type ?? "stdio")))) throw new tools.McpError("copilot.error.unsupportedEntry", { name })
      await io.files.write(place, tools.editJson(text, [place.key, name], undefined))
    },
    async locate(io, id, name) {
      const { place, text } = await contents(io, id)
      return tools.jsonValueLines(text, [place.key, name])
    },
  }
}
