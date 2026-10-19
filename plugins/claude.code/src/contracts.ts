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
export type PromptPlace = any

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
