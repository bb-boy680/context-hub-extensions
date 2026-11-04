import type { McpDeclaration, McpEntry, McpIo, McpProvider, McpRef, McpTools } from "./contracts.ts"
import { ZCODE_CONFIG, ZCODE_GLOBAL_CONFIG, ZCODE_ID, ZCODE_MCP_FALLBACK } from "./locations.ts"

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
function strings(value: unknown): boolean {
  return object(value) && Object.values(value).every((item) => typeof item === "string")
}
function canonical(value: unknown): value is Record<string, unknown> {
  if (!object(value) || ["environment", "http_headers", "enable"].some((key) => Object.hasOwn(value, key))) return false
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") return false
  if (value.type === "stdio") {
    return typeof value.command === "string" && value.command.trim() !== "" &&
      (value.args === undefined || (Array.isArray(value.args) && value.args.every((arg) => typeof arg === "string"))) &&
      (value.env === undefined || strings(value.env)) && value.url === undefined && value.headers === undefined
  }
  return (value.type === "http" || value.type === "sse") && typeof value.url === "string" && value.url.trim() !== "" &&
    (value.headers === undefined || strings(value.headers)) && value.command === undefined && value.args === undefined && value.env === undefined
}

export function createZCodeMcp(tools: McpTools): McpProvider {
  const places = [
    { id: "zcode-global", label: "ZCode", scope: "global", file: ZCODE_GLOBAL_CONFIG, switchable: true },
    { id: "zcode", label: "ZCode", scope: "workspace", file: ZCODE_CONFIG, switchable: true },
  ] as const
  const fail = (key: string, file: string, failure?: unknown): Error => new tools.McpError(
    `zcode.error.${key}`, { file }, failure instanceof Error ? failure.message : failure === undefined ? undefined : String(failure)
  )
  const fileOf = (id: string): McpRef => {
    const place = places.find((one) => one.id === id)
    if (place === undefined) throw new tools.McpError("zcode.error.unknownPlace", { place: id })
    return { scope: place.scope, file: place.file }
  }
  const read = async (io: McpIo, ref: McpRef): Promise<string | null> => {
    try { return await io.files.read(ref) } catch (error) { throw fail("refused", ref.file, error) }
  }
  const parse = (text: string | null, ref: McpRef): Record<string, unknown> => {
    if (text === null) return {}
    try {
      const document: unknown = JSON.parse(text)
      if (!object(document)) throw new Error("配置必须是 JSON object")
      return document
    } catch (error) { throw fail("json", ref.file, error) }
  }
  const serversOf = (document: Record<string, unknown>, ref: McpRef): Record<string, unknown> => {
    if (!Object.hasOwn(document, "mcp")) return {}
    if (!object(document.mcp)) throw fail("json", ref.file)
    if (!Object.hasOwn(document.mcp, "servers")) return {}
    if (!object(document.mcp.servers)) throw fail("json", ref.file)
    return document.mcp.servers
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
  const fallbackCheck = async (io: McpIo, ref: McpRef): Promise<void> => {
    const fallback = { scope: ref.scope, file: ZCODE_MCP_FALLBACK }
    const document = parse(await read(io, fallback), fallback)
    if (!Object.hasOwn(document, "mcpServers")) return
    if (!object(document.mcpServers)) throw fail("json", fallback.file)
    if (Object.keys(document.mcpServers).length > 0) throw fail("fallback", fallback.file)
  }

  return {
    id: ZCODE_ID,
    places,
    async read(io, place) {
      const ref = fileOf(place)
      const servers = serversOf(parse(await read(io, ref), ref), ref)
      return Object.entries(servers).map(([name, entry]): McpEntry => ({
        name,
        declaration: canonical(entry) ? tools.readDeclaration(entry) : null,
        enabled: object(entry) && entry.enabled === false ? false : true,
      }))
    },
    async install(io, place, name, declaration: McpDeclaration) {
      const ref = fileOf(place)
      const text = await read(io, ref)
      const servers = serversOf(parse(text, ref), ref)
      const existing = entryOf(servers, name, ref)
      const values = { ...tools.writeDeclaration(declaration), type: declaration.transport }
      if (name.trim() === "" || !canonical(values)) throw fail("unsupported", ref.file)
      if (Object.keys(servers).length === 0) await fallbackCheck(io, ref)
      const target = ["mcp", "servers", name]
      let after = text
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
      await write(io, ref, tools.editJson(text, ["mcp", "servers", name], undefined))
    },
    async setEnabled(io, place, scope, name, enabled) {
      const ref = fileOf(place)
      if (scope !== ref.scope) throw fail("scope", ref.file)
      const text = await read(io, ref)
      const servers = serversOf(parse(text, ref), ref)
      if (entryOf(servers, name, ref) === undefined) throw fail("missing", ref.file)
      await write(io, ref, tools.editJson(text, ["mcp", "servers", name, "enabled"], enabled ? undefined : false))
    },
    async locate(io, place, name) {
      const ref = fileOf(place)
      const text = await read(io, ref)
      serversOf(parse(text, ref), ref)
      return text === null ? null : tools.jsonValueLines(text, ["mcp", "servers", name])
    },
  }
}
