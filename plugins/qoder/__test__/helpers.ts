import type { McpDeclaration, McpIo, McpRef, McpTools, PromptTools } from "../src/contracts.ts"

export class NamedError extends Error {
  constructor(readonly key: string, readonly params?: Record<string, string>, detail?: string) {
    super(detail === undefined ? key : `${key}: ${detail}`)
  }
}

export const tools: McpTools = {
  readJsonObject(text) {
    if (text === null || text.trim() === "") return null
    const value: unknown = JSON.parse(text)
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("not an object")
    return value as Record<string, unknown>
  },
  editJson(text, path, value) {
    const document = text === null ? {} : JSON.parse(text)
    let parent = document
    for (const key of path.slice(0, -1)) {
      if (!Object.hasOwn(parent, key)) parent[key] = {}
      parent = parent[key]
    }
    const last = path[path.length - 1]!
    if (value === undefined) delete parent[last]
    else Object.defineProperty(parent, last, { value, enumerable: true, configurable: true, writable: true })
    return JSON.stringify(document, null, 2)
  },
  jsonValueLines: () => [2, 4],
  McpError: NamedError,
  readDeclaration(value): McpDeclaration | null {
    const entry = value as Record<string, unknown>
    return entry.type === undefined || entry.type === "stdio"
      ? { transport: "stdio", command: entry.command as string, args: (entry.args ?? []) as string[], env: (entry.env ?? {}) as Record<string, string> }
      : { transport: entry.type === "sse" ? "sse" : "http", url: entry.url as string, headers: (entry.headers ?? {}) as Record<string, string> }
  },
  writeDeclaration(declaration) {
    return declaration.transport === "stdio"
      ? { command: declaration.command, args: declaration.args, env: declaration.env }
      : { url: declaration.url, headers: declaration.headers }
  },
}

export const promptTools: PromptTools = {
  slugOf: (name) => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "pempty",
  describeBody: (body) => body.trim().split("\n")[0] ?? "",
  commandFile: ({ name, description, body, frontmatter }) => frontmatter
    ? `---\nname: ${JSON.stringify(name)}\ndescription: ${JSON.stringify(description)}\n---\n\n${body}\n`
    : `${body}\n`,
  withSection: (text, { slug, title, body }) => {
    const start = `<!-- context-hub:${slug} -->`, end = `<!-- /context-hub:${slug} -->`
    const block = `${start}\n## ${title}\n\n${body}\n${end}\n`
    if (text === null || !text.includes(start)) return `${text ?? ""}${block}`
    return text.slice(0, text.indexOf(start)) + block + text.slice(text.indexOf(end) + end.length).replace(/^\n/, "")
  },
  withoutSection: (text, slug) => {
    const start = `<!-- context-hub:${slug} -->`, end = `<!-- /context-hub:${slug} -->`
    if (!text.includes(start)) return null
    return text.slice(0, text.indexOf(start)) + text.slice(text.indexOf(end) + end.length).replace(/^\n/, "")
  },
  PromptError: NamedError,
}

export const local: McpDeclaration = { transport: "stdio", command: "node", args: ["server.js"], env: {} }
export function memoryIo(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial))
  const writes: McpRef[] = []
  const key = (ref: McpRef) => `${ref.scope}:${ref.file}`
  const io: McpIo = {
    files: {
      async read(ref) { return files.get(key(ref)) ?? null },
      async write(ref, text) { writes.push(ref); files.set(key(ref), text) },
    },
    log() {},
  }
  return { io, files, writes }
}
