import type { McpDeclaration, McpIo, McpPlace, McpProvider, McpTools } from "./contracts.ts"
import { DEEPSEEK_HARNESS_ID } from "./locations.ts"
import { validServerName, writeMcpConfig } from "./mcp-config.ts"
import { HOME_PLACE, mcpPlaces, profileManifest } from "./mcp-places.ts"
import { parsePatch, retainedComments, updateFields, type ParsedPatch, type PatchRow } from "./mcp-patch.ts"

const EMPTY = "[]\n"
type Snapshot = { text: string | null; root: string }
type FileState = { place: McpPlace; before: Snapshot; profile?: Snapshot; text: string; parsed: ParsedPatch }

function appendPatch(text: string, patch: string, tools: McpTools): string {
  const root = tools.parseYamlDocument(text)
  if (root === null || root.kind !== "seq") throw new Error("patch must be a sequence")
  const newline = text.includes("\r\n") ? "\r\n" : "\n"
  const block = patch.replace(/\n/g, newline)
  if ((root.items ?? []).length === 0 && text.slice(root.range[0], root.range[1]).trim() === "[]") {
    return tools.spliceYamlDocument(text, root.range[0], root.range[1], block)
  }
  return tools.spliceYamlDocument(text, text.length, text.length, `${text.endsWith("\n") ? "" : newline}${block}${newline}`)
}

function deleteRow(text: string, node: { range: readonly [number, number, number] }, tools: McpTools): string {
  const start = text.lastIndexOf("\n", node.range[0] - 1) + 1
  const prefix = text.slice(start, node.range[0])
  if (!/^\s*-\s+$/.test(prefix)) throw new Error("unsafe sequence entry")
  const end = node.range[1]
  const newline = text.includes("\r\n") ? "\r\n" : "\n"
  const indent = /^(\s*)-/.exec(prefix)?.[1] ?? ""
  const comments = retainedComments(text.slice(start, end), indent, newline)
  const root = tools.parseYamlDocument(text)
  const only = root?.kind === "seq" && root.items?.length === 1 && root.items[0]?.range[0] === node.range[0]
  return tools.spliceYamlDocument(text, start, end, `${comments}${only ? `[]${newline}` : ""}`)
}

async function stableId(name: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(name))
  return `context-hub-mcp-${Array.from(new Uint8Array(digest).slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("")}`
}

function entryPatch(id: string, config: Record<string, unknown>): string {
  const fields = Object.entries(config).map(([key, value]) => `        ${key}: ${JSON.stringify(value)}`)
  return [`- insert:`, `    - id: ${JSON.stringify(id)}`, `      name: "@deepseek-ai/dsh-mcp-client"`, `      config:`, ...fields].join("\n")
}

export function createDeepSeekHarnessMcp(tools: McpTools): McpProvider {
  const failure = (key: string, params?: Record<string, string>, reason?: unknown) =>
    new tools.McpError(`deepseekHarness.error.${key}`, params, reason instanceof Error ? reason.message : String(reason ?? ""))
  let resolved: readonly McpPlace[] = [HOME_PLACE]
  const places = async (io: McpIo): Promise<McpPlace[]> => {
    const current = await mcpPlaces(io, tools)
    resolved = current
    return current
  }

  async function placeOf(io: McpIo, id: string): Promise<McpPlace> {
    const found = (await places(io)).find((place) => place.id === id)
    if (found === undefined) throw failure("unknownPlace", { place: id })
    return found
  }

  async function ensureProfile(io: McpIo, place: McpPlace): Promise<void> {
    if (place.installable === false && !profileManifest(await io.files.read({ ...place, file: place.file.replace(/cordis\.patch\.yml$/, "package.json") }))) {
      throw failure("unknownPlace", { place: place.id })
    }
  }

  async function snapshot(io: McpIo, place: McpPlace): Promise<FileState> {
    if (io.files.snapshot === undefined || io.files.commit === undefined) throw failure("unsupported")
    const before = await io.files.snapshot(place)
    const profile = place.installable === false
      ? await io.files.snapshot({ ...place, file: place.file.replace(/cordis\.patch\.yml$/, "package.json") })
      : undefined
    const text = before.text ?? EMPTY
    return { place, before, ...(profile === undefined ? {} : { profile }), text, parsed: parsePatch(text, tools) }
  }

  async function all(io: McpIo): Promise<FileState[]> {
    const current = await mcpPlaces(io, tools, io.place?.rootIdentity)
    return Promise.all(current.map((place) => snapshot(io, place)))
  }

  async function commit(io: McpIo, states: FileState[], target: FileState, next: string): Promise<void> {
    if (io.files.snapshot === undefined || io.files.commit === undefined) throw failure("unsupported")
    const current = await mcpPlaces(io, tools, target.before.root)
    if (current.map((place) => place.id).join("\n") !== states.map((state) => state.place.id).join("\n")) {
      throw failure("conflict", { file: target.place.file })
    }
    for (const state of states) {
      const before = await io.files.snapshot(state.place)
      if (before.root !== state.before.root || before.text !== state.before.text) throw failure("conflict", { file: state.place.file })
      if (state.profile !== undefined) {
        const manifest = await io.files.snapshot({ ...state.place, file: state.place.file.replace(/cordis\.patch\.yml$/, "package.json") })
        if (manifest.root !== state.profile.root || manifest.text !== state.profile.text) throw failure("conflict", { file: state.place.file })
      }
    }
    if (next !== target.text || target.before.text === null) await io.files.commit(target.place, target.before, next)
  }

  function selected(states: FileState[], id: string): FileState {
    const found = states.find((state) => state.place.id === id)
    if (found === undefined) throw failure("unknownPlace", { place: id })
    return found
  }

  function unique(state: FileState, name: string): PatchRow | null {
    const matches = state.parsed.rows.filter((row) => row.entry.name === name)
    if (matches.length > 1 || matches[0]?.entry.readOnly === true) throw failure("conflict", { file: state.place.file })
    return matches[0] ?? null
  }

  async function mutate(io: McpIo, id: string, name: string, action: "install" | "remove" | "enable", declaration?: McpDeclaration, enabled?: boolean): Promise<void> {
    if (!validServerName(name)) throw failure("invalidName", { name })
    if (io.place !== undefined && (io.place.id !== id || io.place.rootIdentity === undefined)) throw failure("conflict", { file: id })
    let file = id
    try {
      const states = await all(io)
      const target = selected(states, id)
      file = target.place.file
      if (io.place !== undefined && (io.place.id !== id || io.place.rootIdentity === undefined ||
        io.place.rootIdentity !== target.place.rootIdentity || io.place.file !== target.place.file)) {
        throw failure("conflict", { file })
      }
      const uncertain = states.find((state) => state.parsed.uncertain)
      if (uncertain !== undefined) throw failure("conflict", { file: uncertain.place.file })
      const row = unique(target, name)
      let next = target.text
      if (action === "install") {
        const conflict = target.place.id === HOME_PLACE.id
          ? states.find((state) => state.place.id !== id && state.parsed.rows.some((candidate) => candidate.entry.name === name))
          : undefined
        if (conflict !== undefined) throw failure("conflict", { file: conflict.place.file })
        if (declaration === undefined) throw failure("invalidEntry", { name })
        const config = writeMcpConfig(name, declaration)
        if (config === null) throw failure(declaration.transport === "sse" ? "sse" : "invalidEntry", { name })
        if (row === null) {
          if (target.place.installable === false) throw failure("scanOnly", { file: target.place.file })
          if (states.some((state) => state.parsed.rows.some((candidate) => candidate.entry.name === name))) {
            throw failure("conflict", { file: target.place.file })
          }
          const entryId = await stableId(name)
          if (states.some((state) => state.parsed.ids.includes(entryId))) throw failure("conflict", { file: target.place.file })
          next = appendPatch(next, entryPatch(entryId, config), tools)
        } else {
          if (row.config === null) throw failure("conflict", { file: target.place.file })
          const updates: Record<string, unknown> = { ...config }
          if (declaration.transport === "stdio") {
            updates.url = undefined
            updates.headers = undefined
          } else {
            updates.command = undefined
            updates.args = undefined
            updates.env = undefined
            updates.cwd = undefined
          }
          next = updateFields(next, row.config, updates, tools)
        }
      } else if (action === "enable") {
        if (row === null || row.id === null || enabled === undefined) throw failure("missingEntry", { name })
        if (row.entry.enabled === enabled) return
        if (row.override !== null) next = updateFields(next, row.override, { disabled: !enabled }, tools)
        else next = appendPatch(next, `- id: ${JSON.stringify(row.id)}\n  disabled: ${!enabled}`, tools)
      } else {
        if (row === null) return
        if (row.override !== null) {
          next = deleteRow(next, row.override, tools)
          const reparsed = parsePatch(next, tools)
          const remaining = reparsed.rows.find((candidate) => candidate.entry.name === name)
          if (remaining === undefined) throw failure("conflict", { file: target.place.file })
          next = removeDeclaration(next, remaining, tools)
        } else next = removeDeclaration(next, row, tools)
      }
      await commit(io, states, target, next)
    } catch (reason) {
      if (reason instanceof tools.McpError) throw reason
      throw failure("refused", { file }, reason)
    }
  }

  return {
    id: DEEPSEEK_HARNESS_ID,
    places: [HOME_PLACE],
    placesFor: places,
    async read(io, id) {
      if (io.place !== undefined && (io.place.id !== id || io.place.rootIdentity === undefined)) throw failure("conflict", { file: id })
      const place = io.place ?? resolved.find((entry) => entry.id === id) ?? await placeOf(io, id)
      await ensureProfile(io, place)
      const text = await io.files.read(place)
      return text === null ? [] : parsePatch(text, tools).rows.map((row) => row.entry)
    },
    install: (io, id, name, declaration) => mutate(io, id, name, "install", declaration),
    uninstall: (io, id, name) => mutate(io, id, name, "remove"),
    async setEnabled(io, id, scope, name, enabled) {
      if (scope !== "global") throw failure("scope", { place: id, scope })
      await mutate(io, id, name, "enable", undefined, enabled)
    },
    async locate(io, id, name) {
      if (io.place !== undefined && (io.place.id !== id || io.place.rootIdentity === undefined)) throw failure("conflict", { file: id })
      const place = io.place ?? await placeOf(io, id)
      await ensureProfile(io, place)
      const text = await io.files.read(place)
      if (text === null) return null
      const row = parsePatch(text, tools).rows.find((candidate) => candidate.entry.name === name)
      if (row === undefined) return null
      let end = row.node.range[1]
      while (end > row.node.range[0] && (text[end - 1] === "\n" || text[end - 1] === "\r")) end -= 1
      return [text.slice(0, row.node.range[0]).split("\n").length, text.slice(0, end).split("\n").length]
    },
  }
}

function removeDeclaration(text: string, row: PatchRow, tools: McpTools): string {
  if ((row.insert.items ?? []).length === 1) {
    if ((row.patch.pairs ?? []).length !== 1) throw new Error("insert patch has additional fields")
    return deleteRow(text, row.patch, tools)
  }
  return deleteRow(text, row.node, tools)
}
