import type { McpDeclaration, McpIo, McpRef, McpTools, PromptTools } from "../src/contracts.ts"

export class NamedError extends Error {
  constructor(readonly key: string, readonly params?: Record<string, string>, detail?: string) {
    super(detail === undefined ? key : `${key}: ${detail}`)
  }
}

export function editJson(text: string | null, path: readonly (string | number)[], value: unknown): string {
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
}
export const tools: McpTools = {
  editJson,
  jsonValueLines: () => [2, 4],
  McpError: NamedError,
  readDeclaration(value): McpDeclaration | null {
    const entry = value as Record<string, unknown>
    return entry.type === "stdio"
      ? { transport: "stdio", command: entry.command as string, args: (entry.args ?? []) as string[], env: (entry.env ?? {}) as Record<string, string> }
      : { transport: entry.type as "http" | "sse", url: entry.url as string, headers: (entry.headers ?? {}) as Record<string, string> }
  },
  writeDeclaration(declaration) {
    return declaration.transport === "stdio"
      ? { command: declaration.command, args: declaration.args, env: declaration.env }
      : { url: declaration.url, headers: declaration.headers }
  },
}
export const promptTools: PromptTools = {
  slugOf: (name) => name.toLowerCase().replace(/\s+/g, "-"),
  describeBody: (body) => body.trim().split("\n")[0] ?? "",
  commandFile: ({ name, description, body }) => `---\nname: ${JSON.stringify(name)}\ndescription: ${JSON.stringify(description)}\n---\n\n${body}\n`,
  withSection: (text, { slug, title, body }) => {
    const block = `<!-- context-hub:${slug} -->\n## ${title}\n\n${body}\n<!-- /context-hub:${slug} -->\n`
    const start = text?.indexOf(`<!-- context-hub:${slug} -->`) ?? -1
    return start < 0 ? `${text ?? ""}${block}` : `${text!.slice(0, start)}${block}`
  },
  withoutSection: (text, slug) => {
    const start = text.indexOf(`<!-- context-hub:${slug} -->`)
    return start < 0 ? null : text.slice(0, start)
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
