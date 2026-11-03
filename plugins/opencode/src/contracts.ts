/**
 * The part of Context Hub's extension contracts this plugin uses.
 *
 * A downloaded plugin is a directory that imports nothing but React, so the
 * hub's own packages are not on disk. These are the shapes its registrations
 * pass across the service boundary; the hub validates them, and this file
 * mirrors only the members used here.
 */
export type ExtensionIcon = (props: {
  className?: string
  "aria-hidden"?: boolean
}) => unknown

/** The skills module reads one agent's places through this registry. */
export interface SkillPlace {
  id: string
  labelKey: string
  icon: ExtensionIcon
  scope: "global" | "workspace"
  dir: string
  order: number
}

export interface SkillProvider {
  id: string
  shared?: boolean
  places: readonly SkillPlace[]
}

export interface SkillRegistryPoint {
  providers(): readonly SkillProvider[]
  register(provider: SkillProvider): () => void
}

/** A server the client starts as a child process. */
export interface McpStdioDeclaration {
  transport: "stdio"
  command: string
  args: string[]
  env: Record<string, string>
}

/** A server the client reaches over the network. */
export interface McpRemoteDeclaration {
  transport: "sse" | "http"
  url: string
  headers: Record<string, string>
}

export type McpDeclaration = McpStdioDeclaration | McpRemoteDeclaration

export interface McpEntry {
  name: string
  declaration: McpDeclaration
  enabled: boolean
}

export interface McpPlace {
  id: string
  label: string
  switchable: boolean
  scope: "global" | "workspace"
  file: string
}

export interface McpIo {
  files: {
    read(place: { scope: "global" | "workspace"; file: string }): Promise<string | null>
    write(place: { scope: "global" | "workspace"; file: string }, text: string): Promise<void>
  }
  log(level: "info" | "warn" | "error", message: string): void
}

/**
 * The MCP toolkit the service hands over. Only the JSONC members are mirrored:
 * OpenCode's own config is JSON with comments, and this provider has no use for
 * the TOML editor.
 */
export interface McpTools {
  editJson(
    text: string | null,
    path: readonly (string | number)[],
    value: unknown
  ): string
  readJsonObject(text: string | null): Record<string, unknown> | null
  jsonValueLines(text: string, path: readonly (string | number)[]): [number, number] | null
  McpError: McpErrorConstructor
}

export interface McpErrorConstructor {
  new (key: string, params?: Record<string, string>, detail?: string): Error
}

export interface McpProvider {
  id: string
  places: readonly McpPlace[]
  read(io: McpIo, place: string): Promise<McpEntry[]>
  install(io: McpIo, place: string, name: string, declaration: McpDeclaration): Promise<void>
  uninstall(io: McpIo, place: string, name: string): Promise<void>
  setEnabled?(
    io: McpIo,
    place: string,
    scope: "workspace" | "global",
    name: string,
    enabled: boolean
  ): Promise<void>
  locate?(io: McpIo, place: string, name: string): Promise<[number, number] | null>
}

export interface AgentTargetDescriptor {
  id: string
  displayName: string
  icon: ExtensionIcon
  supports: readonly string[]
  locations: readonly { label: string; path: string }[]
  format: string
}

export interface LocaleContribution {
  id: string
  label: string
  messages: Record<string, string>
}

/** What a prompt provider is given: one prompt as the library stores it. */
export interface Prompt {
  name: string
  description: string
  prompt: string
}

export type PromptScope = "workspace" | "global"

/** One file under one of the client's roots. */
export interface PromptRef {
  scope: PromptScope
  file: string
}

/** The client-file port a provider reads and writes through. */
export interface PromptFiles {
  read(ref: PromptRef): Promise<string | null>
  write(ref: PromptRef, text: string): Promise<void>
  remove(ref: PromptRef): Promise<void>
  workspace(): Promise<string | null>
}

export interface PromptIo {
  files: PromptFiles
  workspace(): Promise<string | null>
}

export interface PromptFormOption {
  id: string
  labelKey: string
  removeLabelKey?: string
}

export interface PromptForm {
  id: string
  labelKey: string
  removeLabelKey?: string
  options?: readonly PromptFormOption[]
}

export interface PromptPlace {
  id: string
  agent: string
  labelKey: string
  icon: ExtensionIcon
  scope: PromptScope
  order: number
  generatedOnly?: boolean
  where?: string
  forms: readonly PromptForm[]
}

export type PromptHeld = Readonly<Record<string, boolean>>

/** A failure a provider names, so the page shows its own localized sentence. */
export interface PromptErrorConstructor {
  new (
    key: string,
    params?: Record<string, string>,
    detail?: string
  ): Error & { key: string; params?: Record<string, string> }
}

/** The file-naming and section rules the hub hands to a provider. */
export interface PromptTools {
  slugOf(name: string): string
  describeBody(body: string): string
  commandFile(input: {
    name: string
    description: string
    body: string
    frontmatter: boolean
  }): string
  withSection(
    existing: string | null,
    input: { slug: string; title: string; body: string }
  ): string
  withoutSection(existing: string, slug: string): string | null
  PromptError: PromptErrorConstructor
}

export interface PromptProvider {
  id: string
  shared?: boolean
  places: readonly PromptPlace[]
  held(io: PromptIo, place: string, prompt: Prompt): Promise<PromptHeld>
  install(
    io: PromptIo,
    place: string,
    prompt: Prompt,
    form: string,
    option?: string
  ): Promise<void>
  remove(
    io: PromptIo,
    place: string,
    prompt: Prompt,
    form: string,
    option?: string
  ): Promise<boolean>
}

/** The services and contribution points this extension reads from its scope. */
export interface OpenCodeScope {
  skills: SkillRegistryPoint
  prompts: { tools: PromptTools; register(provider: PromptProvider): unknown }
  mcp: { tools: McpTools; register(provider: McpProvider): unknown }
  targets: { register(target: AgentTargetDescriptor): unknown }
  locales: { register(locale: LocaleContribution): unknown }
}
