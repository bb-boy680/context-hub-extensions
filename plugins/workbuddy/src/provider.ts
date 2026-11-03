import type { McpEntry, McpIo, McpProvider, McpTools } from "./contracts.ts"
import { MCP_FILE, WORKBUDDY_ID } from "./locations.ts"

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export function createWorkBuddyMcp(tools: McpTools): McpProvider {
  const { McpError, editJson, jsonValueLines, readJsonObject, readDeclaration, writeDeclaration } = tools
  const fileOf = (place: string) => {
    if (place === "workbuddy") return { scope: "workspace" as const, file: MCP_FILE }
    if (place === "workbuddy-global") return { scope: "global" as const, file: MCP_FILE }
    throw new McpError("workbuddy.error.unknownPlace", { place })
  }
  const read = async (io: McpIo, place: string) => {
    const ref = fileOf(place)
    const text = await io.files.read(ref)
    const doc = readJsonObject(text)
    const servers = doc?.mcpServers
    if (servers !== undefined && !object(servers)) throw new McpError("workbuddy.error.invalidMcp", { file: ref.file })
    return { ref, text, servers: (servers ?? {}) as Record<string, unknown> }
  }
  const valid = (entry: unknown) => object(entry) && typeof entry.command === "string" && entry.command !== "" &&
    (entry.type === undefined || entry.type === "stdio") && !("url" in entry) &&
    (entry.args === undefined || (Array.isArray(entry.args) && entry.args.every((arg) => typeof arg === "string"))) &&
    (entry.env === undefined || (object(entry.env) && Object.values(entry.env).every((value) => typeof value === "string")))
  const check = (entry: unknown, name: string) => {
    if (!valid(entry)) throw new McpError("workbuddy.error.invalidEntry", { name })
  }
  return {
    id: WORKBUDDY_ID,
    places: ["global", "workspace"].map((scope) => ({
      id: scope === "global" ? "workbuddy-global" : "workbuddy", label: "WorkBuddy", scope,
      file: MCP_FILE, switchable: false,
    })),
    async read(io, place) {
      const { servers } = await read(io, place)
      return Object.entries(servers).map(([name, entry]): McpEntry => ({
        name, declaration: valid(entry) ? readDeclaration(entry) : null, enabled: true,
      }))
    },
    async install(io, place, name, declaration) {
      if (declaration.transport !== "stdio") throw new McpError("workbuddy.error.transport")
      const { ref, text, servers } = await read(io, place)
      const entry = servers[name]
      if (entry !== undefined) check(entry, name)
      const path = ["mcpServers", name]
      if (entry === undefined) {
        await io.files.write(ref, editJson(text, path, writeDeclaration(declaration)))
        return
      }
      const next = writeDeclaration(declaration)
      let updated = text
      for (const key of ["command", "args", "env"]) updated = editJson(updated, [...path, key], next[key])
      await io.files.write(ref, updated)
    },
    async uninstall(io, place, name) {
      const { ref, text, servers } = await read(io, place)
      if (servers[name] === undefined) return
      check(servers[name], name)
      await io.files.write(ref, editJson(text, ["mcpServers", name], undefined))
    },
    async setEnabled() { throw new McpError("workbuddy.error.switch") },
    async locate(io, place, name) {
      const { text } = await read(io, place)
      return text === null ? null : jsonValueLines(text, ["mcpServers", name])
    },
  }
}
