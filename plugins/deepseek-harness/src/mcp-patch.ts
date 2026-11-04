import type { McpDeclaration, McpEntry, McpTools, YamlNode } from "./contracts.ts"
import { readMcpConfig, validServerName } from "./mcp-config.ts"

const MODULE = "@deepseek-ai/dsh-mcp-client"

export interface PatchRow {
  entry: McpEntry
  id: string | null
  node: YamlNode
  patch: YamlNode
  insert: YamlNode
  config: YamlNode | null
  override: YamlNode | null
}

export interface ParsedPatch {
  root: YamlNode
  rows: PatchRow[]
  ids: string[]
  uncertain: boolean
}

function field(node: YamlNode | null, name: string): YamlNode | null {
  return node?.kind === "map" ? node.pairs?.find((pair) => pair.key.kind === "scalar" && !pair.key.tag && !pair.key.anchor && pair.key.value === name)?.value ?? null : null
}

function literal(node: YamlNode | null): unknown {
  if (node === null || node.tag || node.anchor || node.kind === "alias") return undefined
  if (node.kind === "scalar") return node.value
  if (node.kind === "seq") return node.items?.map(literal)
  const entries = node.pairs ?? []
  if (entries.some((pair) => typeof literal(pair.key) !== "string" || literal(pair.key) === "<<" || pair.value === null)) return undefined
  const values = entries.map((pair) => [literal(pair.key) as string, literal(pair.value)] as const)
  if (values.some(([, value]) => value === undefined)) return undefined
  return Object.fromEntries(values)
}

function safe(node: YamlNode | null): boolean {
  if (node === null || node.tag || node.anchor || node.kind === "alias") return false
  if (node.kind === "seq") return (node.items ?? []).every(safe)
  if (node.kind === "map") return (node.pairs ?? []).every((pair) =>
    literal(pair.key) !== "<<" && safe(pair.key) && pair.value !== null && safe(pair.value))
  return true
}

function safeStructure(node: YamlNode | null): boolean {
  if (node === null || node.anchor || node.kind === "alias") return false
  if (node.kind === "seq") return (node.items ?? []).every(safeStructure)
  if (node.kind === "map") return (node.pairs ?? []).every((pair) =>
    typeof literal(pair.key) === "string" && literal(pair.key) !== "<<" && safeStructure(pair.key) && pair.value !== null && safeStructure(pair.value))
  return true
}

function configData(node: YamlNode | null): Record<string, unknown> | null {
  if (node?.kind !== "map" || node.tag || node.anchor) return null
  const data: Record<string, unknown> = {}
  for (const name of ["serverName", "transport", "command", "args", "env", "url", "headers"]) {
    const child = field(node, name)
    if (child === null) continue
    const value = literal(child)
    if (value === undefined) return null
    data[name] = value
  }
  return data
}

function idOf(node: YamlNode): string | null {
  const id = literal(field(node, "id"))
  return typeof id === "string" && id !== "" ? id : null
}

export function parsePatch(text: string, tools: McpTools): ParsedPatch {
  const root = tools.parseYamlDocument(text)
  if (root === null || root.kind !== "seq" || root.anchor || root.tag) throw new Error("patch must be a plain YAML sequence")
  const rows: PatchRow[] = []
  const ids: string[] = []
  const overrides: YamlNode[] = []
  let uncertain = false

  function visit(node: YamlNode, patch: YamlNode, insert: YamlNode, nested: boolean): void {
    if (node.kind !== "map") { uncertain = true; return }
    if ((node.pairs ?? []).some((pair) => typeof literal(pair.key) !== "string")) uncertain = true
    const id = idOf(node)
    if (id !== null) ids.push(id)
    else if (field(node, "id") !== null) uncertain = true
    const nameNode = field(node, "name")
    const module = literal(nameNode)
    if (nameNode !== null && module === undefined) uncertain = true
    const config = field(node, "config")
    if (module === MODULE) {
      if (config?.kind === "map" && (config.pairs ?? []).some((pair) => typeof literal(pair.key) !== "string" || literal(pair.key) === "<<")) uncertain = true
      const data = configData(config)
      const name = literal(field(config, "serverName"))
      const display = typeof name === "string" && validServerName(name) ? name : id
      if (typeof name !== "string" || !validServerName(name)) uncertain = true
      if (display === null || display === undefined) { uncertain = true; return }
      const disabled = field(node, "disabled")
      const flag = disabled === null ? false : literal(disabled)
      const enabled = typeof flag === "boolean" ? !flag : null
      const declaration: McpDeclaration | null = data !== null && typeof data === "object" && !Array.isArray(data)
        ? readMcpConfig(data as Record<string, unknown>) : null
      rows.push({
        entry: { name: display, declaration, enabled,
          ...((nested || id === null || declaration === null || enabled === null || !safeStructure(node) || !safeStructure(patch) ||
            config === null || text[config.range[0]] === "{" || text[node.range[0]] === "{") ? { readOnly: true } : {}) },
        id, node, patch, insert, config, override: null,
      })
    }
    const group = field(node, "group")
    if (group !== null && literal(group) === undefined) uncertain = true
    if (literal(group) === true) {
      if (config?.kind === "seq") {
        for (const child of config.items ?? []) visit(child, patch, insert, true)
      } else uncertain = true
    }
  }

  for (const patch of root.items ?? []) {
    if (patch.kind !== "map") { uncertain = true; continue }
    if ((patch.pairs ?? []).some((pair) => typeof literal(pair.key) !== "string")) uncertain = true
    const insert = field(patch, "insert")
    if (insert !== null) {
      if (insert.kind !== "seq") { uncertain = true; continue }
      const target = field(patch, "id")
      if (target !== null && typeof literal(target) !== "string") uncertain = true
      for (const node of insert.items ?? []) visit(node, patch, insert, target !== null)
    } else if (field(patch, "id") !== null) {
      if (idOf(patch) === null) uncertain = true
      overrides.push(patch)
    }
  }

  for (const row of rows) {
    const relevant = overrides.filter((override) => idOf(override) === row.id && row.id !== null)
    const duplicate = rows.filter((candidate) => candidate.entry.name === row.entry.name).length > 1 ||
      (row.id !== null && ids.filter((id) => id === row.id).length > 1)
    if (relevant.length > 1 || duplicate) {
      row.entry.readOnly = true
      row.entry.enabled = null
    }
    if (relevant.length === 1) {
      const override = relevant[0]!
      row.override = override
      const keys = override.pairs?.map((pair) => literal(pair.key)) ?? []
      const name = literal(field(override, "name"))
      const disabled = field(override, "disabled")
      const value = disabled === null ? undefined : literal(disabled)
      if (!safe(override) || keys.some((key) => key !== "id" && key !== "name" && key !== "disabled") ||
        (name !== undefined && name !== MODULE) || typeof value !== "boolean") {
        row.entry.readOnly = true
        row.entry.enabled = null
      } else row.entry.enabled = duplicate ? null : !value
    }
  }
  if (uncertain) for (const row of rows) row.entry.readOnly = true
  for (const override of overrides) {
    const id = idOf(override)
    if (id !== null && !ids.includes(id)) ids.push(id)
  }
  return { root, rows, ids, uncertain }
}

export function retainedComments(source: string, indent: string, newline: string): string {
  const comments: string[] = []
  for (const line of source.split(/\r?\n/)) {
    if (/:\s*[|>][+-]?[0-9]?(?:\s*#.*)?\s*$/.test(line)) throw new Error("cannot safely remove a block scalar")
    let quote = ""
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]!
      if (quote === '"' && char === "\\") { index += 1; continue }
      if (quote === "'" && char === "'" && line[index + 1] === "'") { index += 1; continue }
      if (quote && char === quote) { quote = ""; continue }
      if (!quote && (char === "'" || char === '"') && (index === 0 || /[\s[{:?,-]/.test(line[index - 1]!))) { quote = char; continue }
      if (!quote && char === "#" && (index === 0 || /\s/.test(line[index - 1]!))) {
        comments.push(`${indent}${line.slice(index)}`)
        break
      }
    }
    if (quote) throw new Error("cannot safely remove a multiline quoted scalar")
  }
  return comments.length === 0 ? "" : `${comments.join(newline)}${newline}`
}

/** 修改 block mapping 中自有字段，其他原文字节保持原样。 */
export function updateFields(text: string, node: YamlNode, updates: Record<string, unknown>, tools: McpTools): string {
  if (node.kind !== "map" || node.tag || !safeStructure(node) || text[node.range[0]] === "{") throw new Error("unsafe YAML mapping")
  const pairs = node.pairs ?? []
  if (pairs.length === 0) throw new Error("empty YAML mapping")
  const changes: { start: number; end: number; text: string }[] = []
  const add: string[] = []
  const first = pairs[0]!.key.range[0]
  const line = text.lastIndexOf("\n", first - 1) + 1
  const prefix = text.slice(line, first)
  const sequence = /^(\s*)-\s+$/.exec(prefix)
  const indent = sequence === null ? prefix : `${sequence[1]}  `
  if (!/^\s*$/.test(indent)) throw new Error("unsafe mapping indentation")
  for (const [name, value] of Object.entries(updates)) {
    const pair = pairs.find((item) => literal(item.key) === name)
    if (pair === undefined) {
      if (value !== undefined) add.push(`${indent}${name}: ${JSON.stringify(value)}`)
      continue
    }
    if (pair.value === null || !safe(pair.value)) throw new Error("unsafe YAML value")
    if (value === undefined) {
      const removed = text.slice(pair.key.range[0], pair.value.range[1])
      if (retainedComments(removed, "", "\n") !== "") throw new Error("cannot preserve comments inside removed value")
      changes.push({ start: pair.key.range[0], end: pair.value.range[1], text: "" })
    } else {
      const replaced = text.slice(pair.value.range[0], pair.value.range[1])
      if (retainedComments(replaced, "", "\n") !== "") throw new Error("cannot preserve comments inside replaced value")
      changes.push({ start: pair.value.range[0], end: pair.value.range[1], text: JSON.stringify(value) })
    }
  }
  if (add.length) {
    const last = pairs.at(-1)!.value
    if (last === null) throw new Error("unsafe mapping boundary")
    let valueEnd = last.range[1]
    while (valueEnd > last.range[0] && (text[valueEnd - 1] === "\n" || text[valueEnd - 1] === "\r")) valueEnd -= 1
    const end = text.indexOf("\n", valueEnd)
    const offset = end < 0 ? text.length : (end > 0 && text[end - 1] === "\r" ? end - 1 : end)
    const newline = text.includes("\r\n") ? "\r\n" : "\n"
    changes.push({ start: offset, end: offset, text: `${newline}${add.join(newline)}` })
  }
  let result = text
  for (const change of changes.sort((a, b) => b.start - a.start)) {
    result = tools.spliceYamlDocument(result, change.start, change.end, change.text)
  }
  return result
}
