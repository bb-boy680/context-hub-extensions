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

export type PluginTools = any
export type PluginSwitches = Record<string, Record<string, boolean>>
export type PluginScope = "global" | "workspace" | string

export interface PluginPlace {
  id: string
  label: string
  scope: "global" | "workspace"
  scopeWord: string
  switchable: boolean
  file?: string
  overrides?: string[]
}

export interface PluginHeld {
  name: string
  id: string
  version: string
  scope: string
  enabled: boolean
  marketplace: string
  source?: { kind: "local"; path: string }
  pack: { name: string; version: string; description: string }
}

export interface PluginInstaller {
  id: string
  label: string
  places: readonly PluginPlace[]
  available(tools: PluginTools): boolean | Promise<boolean>
  held(tools: PluginTools): Promise<PluginHeld[]>
  switches(tools: PluginTools): Promise<PluginSwitches>
  install(
    id: string,
    scope: PluginScope,
    tools: PluginTools
  ): Promise<{ message: string; location?: string }>
  remove(id: string, scope: PluginScope, tools: PluginTools): Promise<{ message: string }>
  setEnabled(
    id: string,
    scope: PluginScope,
    on: boolean,
    tools: PluginTools
  ): Promise<{ message: string }>
}

export type McpIo = any
export type McpTools = any
export type McpDeclaration = any

export interface McpEntry {
  name: string
  declaration: McpDeclaration
  enabled: boolean
}

export interface McpProvider {
  id: string
  places: readonly any[]
  read(io: McpIo, place: string): Promise<McpEntry[]>
  install(
    io: McpIo,
    place: string,
    name: string,
    declaration: McpDeclaration
  ): Promise<void>
  uninstall(io: McpIo, place: string, name: string): Promise<void>
  setEnabled(
    io: McpIo,
    place: string,
    scope: PluginScope,
    name: string,
    enabled: boolean
  ): Promise<void>
  locate(io: McpIo, place: string, name: string): Promise<string | null>
}
