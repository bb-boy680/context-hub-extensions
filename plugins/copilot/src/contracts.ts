/* eslint-disable @typescript-eslint/no-explicit-any -- this file mirrors untyped host boundaries */
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

export type SkillPlace = any
export type SkillProvider = any
export type SkillRegistryPoint = any

export type McpDeclaration = any
export type McpEntryValues = any
export type TomlEntryValues = any

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

export interface McpErrorConstructor {
  new (key: string, params?: Record<string, string>, detail?: string): Error
}

export interface McpTools {
  readJsonObject(text: string | null): Record<string, unknown> | null
  editJson(text: string, path: string[], value: unknown): string
  jsonValueLines(text: string, path: string[]): [number, number] | null
  parseToml(text: string): Record<string, unknown>
  setTomlEntry(text: string, table: string, name: string, values: TomlEntryValues): string
  setTomlField(
    text: string,
    table: string,
    name: string,
    field: string,
    value: string | boolean
  ): string
  clearTomlEntry(text: string, table: string, name: string): string
  tomlEntryLines(text: string, table: string, name: string): [number, number] | null
  writeTomlString(value: string): string
  readDeclaration(value: unknown): McpDeclaration
  writeDeclaration(declaration: McpDeclaration): McpEntryValues
  McpError: McpErrorConstructor
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

export interface PackDescription {
  name: string
  version: string
  description: string
  icon?: string
}

export type PluginInstallScope = "user" | "project"

export interface PluginPlace {
  id: string
  label: string
  scope: "global" | "workspace"
  scopeWord: PluginInstallScope
  switchable: boolean
  file?: string
  overrides?: readonly string[]
}

export interface PluginHeld {
  name: string
  id: string
  version: string
  scope: string
  enabled?: boolean
  readOnly?: boolean
  origin?: "record" | "declaration" | "skills-dir"
  sourceAvailable?: boolean
  marketplace: string | null
  source?: { kind: "local"; path: string }
  pack: PackDescription
}

export interface PluginInstallReport {
  message: string
  location?: string
  output?: string
}

export type PluginSwitches = Record<string, Record<string, boolean>>

export interface PluginDiskDeclaration {
  home: string; homeEnv?: string; state: string; stateEnv?: string
  config: { write: readonly string[]; read: readonly string[] }
  stateFiles: { write: readonly string[]; read: readonly string[] }
  workspace: { write: readonly string[]; read: readonly string[] }
  library: { write: readonly string[]; read: readonly string[] }
  external: readonly string[]
}
export interface PluginDiskRoots {
  declaration: PluginDiskDeclaration; config: string; plugins: string; workspace: string | null; library: string; platform: "win32" | "posix"; token?: string
}
export interface PluginDiskRef { root: "config" | "plugins" | "workspace" | "library"; path: string }
export interface PluginDisk {
  roots(scope: PluginDiskDeclaration): Promise<PluginDiskRoots>
  read(roots: PluginDiskRoots, ref: PluginDiskRef): Promise<string | null>
  list(roots: PluginDiskRoots, ref: PluginDiskRef): Promise<{ name: string; directory: boolean }[]>
  removeDirectory(roots: PluginDiskRoots, ref: PluginDiskRef): Promise<void>
  commit(roots: PluginDiskRoots, changes: readonly { ref: PluginDiskRef; before: string | null; after: string | null }[], copy?: { name: string; destination: string; replace?: boolean; pruneVersions?: boolean }): Promise<void>
  run<T>(scope: PluginDiskDeclaration, work: (roots: PluginDiskRoots) => Promise<T>): Promise<T>
}

export interface PluginTools {
  disk?: PluginDisk
  packs(): Promise<{ name: string; description: string; version: string }[]>
  root(): Promise<string>
  syncMarketplace(indexes: readonly { path: string; document: unknown }[]): Promise<void>
  run(program: string, args: readonly string[]): Promise<string>
  files: unknown
  has(program: string): Promise<boolean>
  describe(directory: string, name: string): Promise<PackDescription>
}

export interface PluginInstaller {
  id: string
  label: string
  places: readonly PluginPlace[]
  available(tools: PluginTools): Promise<boolean>
  held(tools: PluginTools): Promise<PluginHeld[]>
  switches?(tools: PluginTools): Promise<PluginSwitches>
  install(
    name: string,
    scope: PluginInstallScope,
    tools: PluginTools
  ): Promise<PluginInstallReport>
  remove(id: string, scope: PluginInstallScope, tools: PluginTools): Promise<PluginInstallReport>
  setEnabled?(
    id: string,
    scope: PluginInstallScope,
    on: boolean,
    tools: PluginTools
  ): Promise<PluginInstallReport>
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

/** The services and contribution points this extension reads from its scope. */
export interface CopilotScope {
  skills: SkillRegistryPoint
  prompts: { tools: PromptTools; register(provider: PromptProvider): unknown }
  mcp: { tools: McpTools; register(provider: McpProvider): unknown }
  plugins: { register(installer: PluginInstaller): unknown }
  targets: { register(target: AgentTargetDescriptor): unknown }
  locales: { register(locale: LocaleContribution): unknown }
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
