import type { FileRef, McpIo, McpTools, PromptIo, PromptTools } from "../src/contracts.ts"

export class TestError extends Error {
  constructor(public key: string, public params?: Record<string, string>) { super(key) }
}

export function memoryFiles() {
  const data = new Map<string, string>()
  const key = (ref: FileRef) => `${ref.scope}:${ref.file}`
  const files = {
    async read(ref: FileRef) { return data.get(key(ref)) ?? null },
    async write(ref: FileRef, text: string) { data.set(key(ref), text) },
    async remove(ref: FileRef) { data.delete(key(ref)) },
    async workspace() { return "/fixture" },
  }
  const io: PromptIo = { files, workspace: files.workspace }
  const mcpIo: McpIo = { files, log() {} }
  return { files, io, mcpIo, data }
}

export const promptTools: PromptTools = {
  slugOf: name => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, ""),
  describeBody: body => body.trim().split(/\r?\n/)[0] ?? "",
  commandFile: input => (input.body.charCodeAt(0) === 0xfeff ? input.body.slice(1) : input.body).replace(/\r\n?/g, "\n").trimEnd() + "\n",
  withSection(existing, { slug, title, body }) {
    const block = `<!-- context-hub:${slug} -->\n## ${title}\n\n${body}\n<!-- /context-hub:${slug} -->`
    const prior = this.withoutSection(existing ?? "", slug)
    return `${(prior ?? existing ?? "").trimEnd()}\n\n${block}\n`.trimStart()
  },
  withoutSection(existing, slug) {
    const open = `<!-- context-hub:${slug} -->`, close = `<!-- /context-hub:${slug} -->`
    const start = existing.indexOf(open), end = existing.indexOf(close)
    return start < 0 || end < 0 ? null : existing.slice(0, start) + existing.slice(end + close.length)
  },
  PromptError: TestError,
}

export const mcpTools: McpTools = {
  McpError: TestError,
  readJsonObject(text) {
    if (text === null || text.trim() === "") return null
    const value: unknown = JSON.parse(text)
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("not an object")
    return value as Record<string, unknown>
  },
  editJson(text, path, value) {
    const doc = text ? JSON.parse(text) : {}
    let parent = doc
    for (const part of path.slice(0, -1)) parent = parent[part] ??= {}
    const key = path.at(-1)!
    if (value === undefined) delete parent[key]
    else parent[key] = value
    return JSON.stringify(doc, null, 2)
  },
  jsonValueLines: () => [1, 1],
  readDeclaration(value) {
    if (!value || typeof value !== "object") return null
    const v = value as Record<string, unknown>
    if (typeof v.command === "string" && v.command) return { transport: "stdio", command: v.command, args: (v.args ?? []) as string[], env: (v.env ?? {}) as Record<string, string> }
    if (typeof v.url === "string" && v.url) return { transport: v.type === "sse" ? "sse" : "http", url: v.url, headers: (v.headers ?? {}) as Record<string, string> }
    return null
  },
  writeDeclaration(value) {
    return value.transport === "stdio" ? { command: value.command, ...(value.args.length && { args: value.args }), ...(Object.keys(value.env).length && { env: value.env }) } : { url: value.url, ...(Object.keys(value.headers).length && { headers: value.headers }) }
  },
}
