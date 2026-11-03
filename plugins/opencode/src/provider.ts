/**
 * OpenCode's own MCP files, as the extension that knows OpenCode reads and
 * writes them.
 *
 * OpenCode V2 keeps servers under `mcp.servers.<name>` in a JSON or JSONC
 * document, and switches one off with a `disabled` boolean on that entry. Six
 * physical files can carry the declaration: two machine-wide, two at a
 * project's root, and two under a project's `.opencode` directory. Each is its
 * own place, so a list row, the raw-text pane and the line locator all point at
 * the exact file a switch changes.
 *
 * Only native V2 configuration is written. A flat `mcp.<name>` server, an old
 * `enabled` field, a numeric `timeout`, or camelCase OAuth fields mark a file
 * this extension does not migrate; the file is left byte for byte and the
 * failure names the reason. Writes go through the hub's JSONC editor, so
 * comments, trailing commas and unrelated nodes keep their place.
 *
 * Types only, and they come from the MCP module because that module owns the
 * contract a client file is written against. A type import is erased, so at run
 * time this plugin reads nothing from that package: the registry to register
 * into and the editors to write with arrive through the `mcp` service.
 */
import type {
  McpDeclaration,
  McpEntry,
  McpIo,
  McpProvider,
  McpRemoteDeclaration,
  McpStdioDeclaration,
  McpTools,
} from "./contracts.ts"
import { OPENCODE_ID, OPENCODE_MCP_PLACES, type OpenCodeMcpPlace } from "./locations.ts"

/** The container every V2 server lives under. */
const SERVERS = ["mcp", "servers"] as const

/** The OAuth names V2 replaced with snake_case. */
const LEGACY_OAUTH = ["clientId", "clientSecret", "callbackPort", "redirectUri"] as const

/** A scope's file reference, as the client-file port takes it. */
interface FileRef {
  scope: "global" | "workspace"
  file: string
}

/**
 * OpenCode, as the MCP module uses it.
 *
 * @param tools — the toolkit the MCP service hands over: the JSONC reader and
 * editor, and {@link McpTools.McpError} to report a failure in this extension's
 * own words.
 */
export function createOpenCodeMcp(tools: McpTools): McpProvider {
  const { McpError, editJson, jsonValueLines, readJsonObject } = tools

  /** The one place this call names, or a failure naming it. */
  const placeOf = (id: string): OpenCodeMcpPlace => {
    const found = OPENCODE_MCP_PLACES.find((place) => place.id === id)
    if (found === undefined) throw new McpError("opencode.error.unknownPlace", { place: id })
    return found
  }

  const fileOf = (id: string): FileRef => {
    const place = placeOf(id)
    return { scope: place.scope, file: place.file }
  }

  /** The file's text, or an empty one when the client has no config yet. */
  const readText = async (io: McpIo, ref: FileRef): Promise<string> => {
    try {
      return (await io.files.read(ref)) ?? ""
    } catch (error) {
      throw new McpError("opencode.error.refused", { file: ref.file }, messageOf(error))
    }
  }

  const writeText = async (io: McpIo, ref: FileRef, text: string): Promise<void> => {
    try {
      await io.files.write(ref, text)
    } catch (error) {
      throw new McpError("opencode.error.refused", { file: ref.file }, messageOf(error))
    }
  }

  /** A refusal to touch a file that is not native V2. */
  const v2Only = (file: string, detail: string): Error =>
    new McpError("opencode.error.v2Only", { file }, detail)

  /**
   * The `mcp.servers` object one file holds.
   *
   * @returns the servers, or null when the file holds no container at all.
   * @throws when the file is not JSONC, when `mcp` or `mcp.servers` is not an
   * object, or when a flat `mcp.<name>` server shows the file is not V2.
   */
  const serversOf = (text: string, file: string): Record<string, unknown> | null => {
    let document: Record<string, unknown> | null
    try {
      document = readJsonObject(text)
    } catch (error) {
      throw new McpError("opencode.error.parse", { file }, messageOf(error))
    }
    if (document === null) return null

    const mcp = document.mcp
    if (mcp === undefined) return null
    if (!isObject(mcp)) throw v2Only(file, "mcp is not an object")

    for (const [key, value] of Object.entries(mcp)) {
      if (key === "servers") continue
      if (looksLikeServer(value)) {
        throw v2Only(file, `mcp.${key} is a flat server entry`)
      }
    }

    const servers = mcp.servers
    if (servers === undefined) return null
    if (!isObject(servers)) throw v2Only(file, "mcp.servers is not an object")
    for (const [name, entry] of Object.entries(servers)) {
      if (legacyEntry(entry)) throw v2Only(file, `server ${name} carries pre-V2 fields`)
    }
    return servers
  }

  /** One server's V2 declaration, or a failure naming the entry. */
  const declarationOf = (entry: unknown, name: string): McpDeclaration => {
    if (!isObject(entry)) throw new McpError("opencode.error.invalidEntry", { name })

    if (entry.type === "local") {
      const argv = entry.command
      if (
        !Array.isArray(argv) ||
        argv.length === 0 ||
        argv.some((item) => typeof item !== "string" || item === "")
      ) {
        throw new McpError("opencode.error.invalidEntry", { name })
      }
      return {
        transport: "stdio",
        command: argv[0] as string,
        args: (argv.slice(1) as string[]),
        env: stringsOf(entry.environment),
      }
    }

    if (entry.type === "remote") {
      if (typeof entry.url !== "string" || entry.url === "") {
        throw new McpError("opencode.error.invalidEntry", { name })
      }
      return { transport: "http", url: entry.url, headers: stringsOf(entry.headers) }
    }

    throw new McpError("opencode.error.invalidEntry", { name })
  }

  /** A write refusal, with the client file it names. */
  const edit = (file: string, change: () => string): string => {
    try {
      return change()
    } catch (error) {
      throw new McpError("opencode.error.refused", { file }, messageOf(error))
    }
  }

  return {
    id: OPENCODE_ID,
    places: OPENCODE_MCP_PLACES.map((place) => ({
      id: place.id,
      label: place.label,
      switchable: true,
      scope: place.scope,
      file: place.file,
    })),

    async read(io, place) {
      const ref = fileOf(place)
      const text = await readText(io, ref)
      const servers = serversOf(text, ref.file)
      if (servers === null) return []

      return Object.entries(servers).map(([name, entry]): McpEntry => {
        if (legacyEntry(entry)) {
          throw v2Only(ref.file, `server ${name} carries pre-V2 fields`)
        }
        return {
          name,
          declaration: declarationOf(entry, name),
          /* V2 spells the switch backwards: a missing field is an enabled server. */
          enabled: fieldOf(entry, "disabled") !== true,
        }
      })
    },

    async install(io, place, name, declaration) {
      const ref = fileOf(place)
      if (declaration.transport === "sse") {
        throw new McpError("opencode.error.sse", { file: ref.file })
      }

      const text = await readText(io, ref)
      const servers = serversOf(text, ref.file)
      const existing = servers?.[name]

      if (existing !== undefined) {
        if (!isObject(existing)) throw new McpError("opencode.error.invalidEntry", { name })
        if (legacyEntry(existing)) {
          throw v2Only(ref.file, `server ${name} carries pre-V2 fields`)
        }
        /* An entry that is not already a complete V2 server is not converted:
           only a native entry keeps its options through an update. */
        if (!isV2Entry(existing)) {
          throw v2Only(ref.file, `server ${name} is not a native V2 entry`)
        }
      }

      const path = [...SERVERS, name]
      if (existing === undefined) {
        const entry =
          declaration.transport === "stdio" ? localEntry(declaration) : remoteEntry(declaration)
        await writeText(io, ref, edit(ref.file, () => editJson(text, path, entry)))
        return
      }

      /* An existing entry keeps its switch and every native option the
         declaration does not speak for. Only the leaves a delivery owns are
         patched, and the fields of the other transport are taken out. */
      let next = text
      if (declaration.transport === "stdio") {
        next = edit(ref.file, () => editJson(next, [...path, "type"], "local"))
        next = edit(ref.file, () =>
          editJson(next, [...path, "command"], [declaration.command, ...declaration.args])
        )
        next = edit(ref.file, () =>
          editJson(next, [...path, "environment"], optional(declaration.env))
        )
        next = edit(ref.file, () => editJson(next, [...path, "url"], undefined))
        next = edit(ref.file, () => editJson(next, [...path, "headers"], undefined))
        next = edit(ref.file, () => editJson(next, [...path, "oauth"], undefined))
      } else {
        next = edit(ref.file, () => editJson(next, [...path, "type"], "remote"))
        next = edit(ref.file, () => editJson(next, [...path, "url"], declaration.url))
        next = edit(ref.file, () =>
          editJson(next, [...path, "headers"], optional(declaration.headers))
        )
        next = edit(ref.file, () => editJson(next, [...path, "command"], undefined))
        next = edit(ref.file, () => editJson(next, [...path, "environment"], undefined))
        next = edit(ref.file, () => editJson(next, [...path, "cwd"], undefined))
      }
      await writeText(io, ref, next)
    },

    async uninstall(io, place, name) {
      const ref = fileOf(place)
      const text = await readText(io, ref)
      const servers = serversOf(text, ref.file)
      refuseLegacyTarget(ref.file, servers, name)
      /* A file the hub never wrote, or one that does not declare this server,
         is left alone rather than created as an empty document. */
      if (servers?.[name] === undefined) return
      await writeText(io, ref, edit(ref.file, () => editJson(text, [...SERVERS, name], undefined)))
    },

    async setEnabled(io, place, scope, name, enabled) {
      const target = placeOf(place)
      if (scope !== target.scope) {
        throw new McpError("opencode.error.scope", { place, scope })
      }

      const ref = fileOf(place)
      const text = await readText(io, ref)
      const servers = serversOf(text, ref.file)
      const entry = servers?.[name]
      if (entry === undefined) {
        throw new McpError("opencode.error.missingEntry", { name, file: ref.file })
      }
      if (!isObject(entry)) throw new McpError("opencode.error.invalidEntry", { name })
      if (legacyEntry(entry)) {
        throw v2Only(ref.file, `server ${name} carries pre-V2 fields`)
      }
      /* A switch is the reverse of the entry's own `disabled` field; it never
         creates a server that is not already declared in this exact file. */
      declarationOf(entry, name)
      await writeText(
        io,
        ref,
        edit(ref.file, () =>
          editJson(text, [...SERVERS, name, "disabled"], !enabled)
        )
      )
    },

    async locate(io, place, name) {
      const ref = fileOf(place)
      const text = await io.files.read(ref)
      if (text === null) return null
      return jsonValueLines(text, [...SERVERS, name])
    },
  }

  /** A target entry that carries pre-V2 fields is not rewritten either. */
  function refuseLegacyTarget(
    file: string,
    servers: Record<string, unknown> | null,
    name: string
  ): void {
    const entry = servers?.[name]
    if (legacyEntry(entry)) {
      throw v2Only(file, `server ${name} carries pre-V2 fields`)
    }
  }
}

/** The entry a stdio declaration is written as in V2. */
function localEntry(declaration: McpStdioDeclaration) {
  return {
    type: "local",
    command: [declaration.command, ...declaration.args],
    ...(Object.keys(declaration.env).length === 0 ? {} : { environment: { ...declaration.env } }),
  }
}

/** The entry an HTTP declaration is written as in V2. */
function remoteEntry(declaration: McpRemoteDeclaration) {
  return {
    type: "remote",
    url: declaration.url,
    ...(Object.keys(declaration.headers).length === 0
      ? {}
      : { headers: { ...declaration.headers } }),
  }
}

/** A map written only when it carries something, so an empty one is removed. */
function optional(values: Record<string, string>): Record<string, string> | undefined {
  return Object.keys(values).length === 0 ? undefined : { ...values }
}

/**
 * Whether an entry carries anything V2 removed: the old `enabled` switch, a
 * numeric timeout, or a camelCase OAuth field. These are recognised only to
 * refuse the file, never to convert it.
 */
function legacyEntry(entry: unknown): boolean {
  if (!isObject(entry)) return false
  /* V1 spelled an SSE server with this type; V2 has no such field. */
  if (entry.type === "sse") return true
  if ("enabled" in entry) return true
  if (typeof entry.timeout === "number") return true
  if (LEGACY_OAUTH.some((key) => key in entry)) return true
  const oauth = entry.oauth
  return isObject(oauth) && LEGACY_OAUTH.some((key) => key in oauth)
}

/** Whether an existing entry is already a complete native V2 server. */
function isV2Entry(entry: Record<string, unknown>): boolean {
  if (entry.type === "local") {
    const argv = entry.command
    return (
      Array.isArray(argv) &&
      argv.length > 0 &&
      argv.every((item) => typeof item === "string" && item !== "")
    )
  }
  return entry.type === "remote" && typeof entry.url === "string" && entry.url !== ""
}

/** Whether a key under `mcp` is a server written in the flat V1 shape. */
function looksLikeServer(value: unknown): boolean {
  if (!isObject(value)) return false
  return ["type", "command", "url", "enabled", "environment", "headers"].some(
    (key) => key in value
  )
}

/** One string-valued field, tolerating a document a person edited by hand. */
function fieldOf(entry: unknown, field: string): unknown {
  return isObject(entry) ? entry[field] : undefined
}

/** The string values of a record, dropping anything else the file holds. */
function stringsOf(value: unknown): Record<string, string> {
  if (!isObject(value)) return {}
  const pairs = Object.entries(value).filter(
    (pair): pair is [string, string] => typeof pair[1] === "string"
  )
  return Object.fromEntries(pairs)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** The message one thrown value carries. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
