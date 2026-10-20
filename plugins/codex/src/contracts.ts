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
  enabled: boolean
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

export interface PluginTools {
  root(): Promise<string>
  syncMarketplace(): Promise<void>
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
export interface CodexScope {
  skills: SkillRegistryPoint
  mcp: { tools: McpTools; register(provider: McpProvider): unknown }
  plugins: { register(installer: PluginInstaller): unknown }
  targets: { register(target: AgentTargetDescriptor): unknown }
  locales: { register(locale: LocaleContribution): unknown }
}
