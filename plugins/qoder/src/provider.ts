import type { McpIo, McpProvider, McpRef, McpTools } from "./contracts.ts"
import { QODER_ID, QODER_LOCAL_SETTINGS, QODER_PROJECT_MCP, QODER_SETTINGS } from "./locations.ts"

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
function strings(value: unknown): boolean {
  return object(value) && Object.values(value).every((item) => typeof item === "string")
}
function canonical(value: unknown): value is Record<string, unknown> {
  if (!object(value) || Object.hasOwn(value, "qoder_url")) return false
  if (value.disabled !== undefined && typeof value.disabled !== "boolean") return false
  if (value.type === undefined || value.type === "stdio") {
    return typeof value.command === "string" && value.command.trim() !== "" &&
      (value.args === undefined || (Array.isArray(value.args) && value.args.every((arg) => typeof arg === "string"))) &&
      (value.env === undefined || strings(value.env)) && (value.cwd === undefined || typeof value.cwd === "string") &&
      value.url === undefined && value.headers === undefined
  }
  return (value.type === "http" || value.type === "streamable-http" || value.type === "sse") &&
    typeof value.url === "string" && value.url.trim() !== "" &&
    (value.headers === undefined || strings(value.headers)) &&
    value.command === undefined && value.args === undefined && value.env === undefined && value.cwd === undefined
}

export function createQoderMcp(tools: McpTools): McpProvider {
  const places = [
    { id: "qoder-global", label: "Qoder CLI", scope: "global", file: QODER_SETTINGS, switchable: true },
    { id: "qoder-project", label: "Qoder CLI", scope: "workspace", file: QODER_PROJECT_MCP, switchable: true },
    { id: "qoder-project-settings", label: "Qoder CLI", scope: "workspace", file: QODER_SETTINGS, switchable: true, installable: false },
    { id: "qoder-project-local", label: "Qoder CLI", scope: "workspace", file: QODER_LOCAL_SETTINGS, switchable: true, installable: false },
  ] as const
  const fail = (key: string, file: string, error?: unknown): Error => new tools.McpError(
    `qoder.error.${key}`, { file }, error instanceof Error ? error.message : error === undefined ? undefined : String(error)
  )
  const fileOf = (id: string): McpRef => {
    const place = places.find((one) => one.id === id)
    if (place === undefined) throw new tools.McpError("qoder.error.unknownPlace", { place: id })
    return { scope: place.scope, file: place.file }
  }
  const read = async (io: McpIo, ref: McpRef): Promise<string | null> => {
    try { return await io.files.read(ref) } catch (error) { throw fail("refused", ref.file, error) }
  }
  const parse = (text: string | null, ref: McpRef): Record<string, unknown> => {
    if (text === null) return {}
    try {
      if (text.trim() === "") throw new Error("empty configuration")
      if (ref.file === QODER_PROJECT_MCP) JSON.parse(text)
      const document = tools.readJsonObject(text)
      if (document === null) throw new Error("missing object")
      return document
    } catch (error) { throw fail("json", ref.file, error) }
  }
  const serversOf = (document: Record<string, unknown>, ref: McpRef): Record<string, unknown> => {
    if (!Object.hasOwn(document, "mcpServers")) return {}
    if (!object(document.mcpServers)) throw fail("json", ref.file)
    return document.mcpServers
  }
  const entryOf = (servers: Record<string, unknown>, name: string, ref: McpRef): Record<string, unknown> | undefined => {
    if (!Object.hasOwn(servers, name)) return undefined
    const entry = servers[name]
    if (!canonical(entry)) throw fail("unsupported", ref.file)
    return entry
  }
  const write = async (io: McpIo, ref: McpRef, text: string): Promise<void> => {
    try { await io.files.write(ref, text) } catch (error) { throw fail("refused", ref.file, error) }
  }
  return {
    id: QODER_ID,
    places,
    async read(io, place) {
      const ref = fileOf(place)
      const servers = serversOf(parse(await read(io, ref), ref), ref)
      return Object.entries(servers).map(([name, entry]) => ({
        name, declaration: canonical(entry) ? tools.readDeclaration(entry) : null,
        enabled: !(object(entry) && entry.disabled === true),
      }))
    },
    async install(io, place, name, declaration) {
      const ref = fileOf(place)
      const text = await read(io, ref)
      const document = parse(text, ref)
      const servers = serversOf(document, ref)
      const existing = entryOf(servers, name, ref)
      const values = { ...tools.writeDeclaration(declaration), type: declaration.transport }
      if (name.trim() === "" || !canonical(values) || (existing?.cwd !== undefined && declaration.transport !== "stdio")) {
        throw fail("unsupported", ref.file)
      }
      let after = text
      if (text !== null && !Object.hasOwn(document, "mcpServers")) after = tools.editJson(after, ["mcpServers"], {})
      const target = ["mcpServers", name]
      if (existing === undefined) after = tools.editJson(after, target, values)
      else {
        for (const key of ["type", "command", "args", "env", "url", "headers"]) {
          after = tools.editJson(after, [...target, key], values[key as keyof typeof values])
        }
      }
      await write(io, ref, after!)
    },
    async uninstall(io, place, name) {
      const ref = fileOf(place)
      const text = await read(io, ref)
      const servers = serversOf(parse(text, ref), ref)
      if (entryOf(servers, name, ref) === undefined) return
      await write(io, ref, tools.editJson(text, ["mcpServers", name], undefined))
    },
    async setEnabled(io, place, scope, name, enabled) {
      const ref = fileOf(place)
      if (scope !== ref.scope) throw fail("scope", ref.file)
      const text = await read(io, ref)
      const servers = serversOf(parse(text, ref), ref)
      if (entryOf(servers, name, ref) === undefined) throw fail("missing", ref.file)
      await write(io, ref, tools.editJson(text, ["mcpServers", name, "disabled"], !enabled))
    },
    async locate(io, place, name) {
      const ref = fileOf(place)
      const text = await read(io, ref)
      serversOf(parse(text, ref), ref)
      return text === null ? null : tools.jsonValueLines(text, ["mcpServers", name])
    },
  }
}
