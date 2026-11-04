export type ExtensionIcon = (props: {
  className?: string
  "aria-hidden"?: boolean
}) => unknown

export interface SkillPlace {
  id: string
  labelKey: string
  icon: ExtensionIcon
  scope: "global" | "workspace"
  dir: string
}

export interface SkillProvider {
  id: string
  shared?: boolean
  places: readonly SkillPlace[]
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

export type McpDeclaration =
  | { transport: "stdio"; command: string; args: string[]; env: Record<string, string> }
  | { transport: "http" | "sse"; url: string; headers: Record<string, string> }

export interface YamlNode {
  kind: "map" | "seq" | "scalar" | "alias"
  range: readonly [number, number, number]
  tag?: string
  anchor?: string
  value?: unknown
  items?: YamlNode[]
  pairs?: { key: YamlNode; value: YamlNode | null }[]
}

export interface McpRef {
  scope: "global"
  file: string
  root: { home: string; homeEnv: string; list: readonly string[] }
  rootIdentity?: string
  /** 将已枚举单层目录名绑定到受限相对路径。 */
  pathTemplate?: { file: string; name: string }
}

export interface McpPlace extends McpRef {
  id: string
  label: string
  switchable: boolean
  installable?: boolean
}

export interface McpIo {
  place?: McpPlace
  files: {
    read(ref: McpRef): Promise<string | null>
    list?(ref: McpRef): Promise<string[]>
    snapshot?(ref: McpRef): Promise<{ text: string | null; root: string }>
    commit?(ref: McpRef, before: { text: string | null; root: string }, text: string): Promise<void>
  }
  log(level: "info" | "warn" | "error", message: string): void
}

export interface McpTools {
  editJson(text: string | null, path: readonly (string | number)[], value: unknown): string
  parseYamlDocument(text: string): YamlNode | null
  spliceYamlDocument(text: string, start: number, end: number, replacement: string): string
  McpError: new (key: string, params?: Record<string, string>, detail?: string) => Error
}

export interface McpEntry {
  name: string
  declaration: McpDeclaration | null
  enabled: boolean | null
  readOnly?: boolean
}

export interface McpProvider {
  id: string
  places: readonly McpPlace[]
  placesFor(io: McpIo): Promise<readonly McpPlace[]>
  read(io: McpIo, place: string): Promise<McpEntry[]>
  install(io: McpIo, place: string, name: string, declaration: McpDeclaration): Promise<void>
  uninstall(io: McpIo, place: string, name: string): Promise<void>
  setEnabled(io: McpIo, place: string, scope: "workspace" | "global", name: string, enabled: boolean): Promise<void>
  locate(io: McpIo, place: string, name: string): Promise<[number, number] | null>
}

export interface Prompt {
  name: string
  description: string
  prompt: string
}

export interface PromptRef {
  scope: "workspace" | "global"
  file: string
}

export interface PromptIo {
  files: {
    read(ref: PromptRef): Promise<string | null>
    write(ref: PromptRef, text: string): Promise<void>
    remove(ref: PromptRef): Promise<void>
    workspace(): Promise<string | null>
  }
  workspace(): Promise<string | null>
}

export interface PromptTools {
  slugOf(name: string): string
  withSection(existing: string | null, input: { slug: string; title: string; body: string }): string
  withoutSection(existing: string, slug: string): string | null
  PromptError: new (key: string, params?: Record<string, string>, detail?: string) => Error
}

export interface PromptPlace {
  id: string
  agent: string
  labelKey: string
  icon: ExtensionIcon
  scope: "global" | "workspace"
  generatedOnly?: boolean
  where?: string
  forms: readonly { id: string; labelKey: string; removeLabelKey?: string }[]
}

export interface PromptProvider {
  id: string
  places: readonly PromptPlace[]
  held(io: PromptIo, place: string, prompt: Prompt): Promise<Record<string, boolean>>
  install(io: PromptIo, place: string, prompt: Prompt, form: string, option?: string): Promise<void>
  remove(io: PromptIo, place: string, prompt: Prompt, form: string, option?: string): Promise<boolean>
}

export interface PluginDiskDeclaration {
  home: string
  homeEnv?: string
  state: string
  config: { write: readonly string[]; read: readonly string[] }
  stateFiles: { write: readonly string[]; read: readonly string[] }
  workspace: { write: readonly string[]; read: readonly string[] }
  library: { write: readonly string[]; read: readonly string[] }
  directories: readonly string[]
  external: readonly string[]
}

export interface PluginDiskRoots {
  declaration: PluginDiskDeclaration
  config: string
  plugins: string
  workspace: string | null
  library: string
  platform: "win32" | "posix"
  token?: string
}

export interface PluginDisk {
  roots(declaration: PluginDiskDeclaration): Promise<PluginDiskRoots>
  read(roots: PluginDiskRoots, ref: { root: "config" | "plugins" | "workspace" | "library"; path: string }): Promise<string | null>
  list(roots: PluginDiskRoots, ref: { root: "config" | "plugins" | "workspace" | "library"; path: string }): Promise<{ name: string; directory: boolean }[]>
}

export interface PluginTools {
  disk?: PluginDisk
}

export interface PluginPlace {
  id: string
  label: string
  scope: "global" | "workspace"
  scopeWord: "user" | "project" | "local"
  switchable: boolean
  installable?: boolean
  initialInstallable?: boolean
  clearable?: boolean
  file?: string
  overrides?: readonly string[]
}

export interface PluginHeld {
  name: string
  id: string
  version: string
  scope: string
  placeId?: string
  enabled?: boolean
  readOnly?: boolean
  origin?: "record" | "declaration" | "skills-dir"
  marketplace: string | null
  pack: { name: string; version: string; description: string }
}

export interface PluginInstallReport {
  message: string
  location?: string
  output?: string
  warning?: string
}

export interface PluginInstaller {
  id: string
  label: string
  places: readonly PluginPlace[]
  placesFor?(tools: PluginTools): Promise<readonly PluginPlace[]>
  available(tools: PluginTools): Promise<boolean>
  held(tools: PluginTools): Promise<PluginHeld[]>
  install(name: string, scope: "user" | "project" | "local", tools: PluginTools): Promise<PluginInstallReport>
  remove(id: string, scope: "user" | "project" | "local", tools: PluginTools): Promise<PluginInstallReport>
  setEnabled?(id: string, scope: "user" | "project" | "local", on: boolean, tools: PluginTools): Promise<PluginInstallReport>
  clearEnabled?(id: string, scope: "user" | "project" | "local", tools: PluginTools): Promise<PluginInstallReport>
}

export interface PluginManifestRule {
  file: string
  required: readonly {
    path: readonly string[]
    kind: "nonempty-string" | "nonempty-string-array" | "nonempty-string-or-array"
  }[]
}

export interface DeepSeekHarnessScope {
  plugins: {
    registerManifestRules(rules: readonly PluginManifestRule[]): unknown
    register(installer: PluginInstaller): unknown
  }
  mcp: { tools: McpTools; register(provider: McpProvider): unknown }
  prompts: { tools: PromptTools; register(provider: PromptProvider): unknown }
  skills: { register(provider: SkillProvider): unknown }
  targets: { register(target: AgentTargetDescriptor): unknown }
  locales: { register(locale: LocaleContribution): unknown }
}
