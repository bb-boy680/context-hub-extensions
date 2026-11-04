export type ExtensionIcon = (props: {
  className?: string
  "aria-hidden"?: boolean
}) => unknown

export interface SkillPlace {
  id: string
  labelKey: string
  icon: ExtensionIcon
  scope: "workspace" | "global"
  dir: string
}
export interface SkillProvider { id: string; places: readonly SkillPlace[] }
export interface AgentTargetDescriptor {
  id: string
  displayName: string
  icon: ExtensionIcon
  supports: readonly string[]
  locations: readonly { label: string; path: string }[]
  format: string
}
export interface LocaleContribution { id: string; label: string; messages: Record<string, string> }
export type McpDeclaration =
  | { transport: "stdio"; command: string; args: string[]; env: Record<string, string> }
  | { transport: "http" | "sse"; url: string; headers: Record<string, string> }
export interface McpRef { scope: "global" | "workspace"; file: string }
export interface McpIo {
  files: { read(ref: McpRef): Promise<string | null>; write(ref: McpRef, text: string): Promise<void> }
  log(level: "info" | "warn" | "error", message: string): void
}
export interface McpTools {
  editJson(text: string | null, path: readonly (string | number)[], value: unknown): string
  readJsonObject(text: string | null): Record<string, unknown> | null
  jsonValueLines(text: string, path: readonly (string | number)[]): [number, number] | null
  readDeclaration(value: unknown): McpDeclaration | null
  writeDeclaration(value: McpDeclaration): Record<string, unknown>
  McpError: new (key: string, params?: Record<string, string>, detail?: string) => Error
}
export interface McpProvider {
  id: string
  places: readonly (McpRef & { id: string; label: string; switchable: boolean; installable?: boolean })[]
  read(io: McpIo, place: string): Promise<{ name: string; declaration: McpDeclaration | null; enabled: boolean }[]>
  install(io: McpIo, place: string, name: string, declaration: McpDeclaration): Promise<void>
  uninstall(io: McpIo, place: string, name: string): Promise<void>
  setEnabled(io: McpIo, place: string, scope: "workspace" | "global", name: string, enabled: boolean): Promise<void>
  locate(io: McpIo, place: string, name: string): Promise<[number, number] | null>
}
export interface Prompt { name: string; description: string; prompt: string }
export interface PromptRef { scope: "workspace" | "global"; file: string }
export interface PromptFiles {
  read(ref: PromptRef): Promise<string | null>
  write(ref: PromptRef, text: string): Promise<void>
  remove(ref: PromptRef): Promise<void>
  workspace(): Promise<string | null>
}
export interface PromptIo { files: PromptFiles; workspace(): Promise<string | null> }
export interface PromptTools {
  slugOf(name: string): string
  describeBody(body: string): string
  commandFile(input: { name: string; description: string; body: string; frontmatter: boolean }): string
  withSection(text: string | null, input: { slug: string; title: string; body: string }): string
  withoutSection(text: string, slug: string): string | null
  PromptError: new (key: string, params?: Record<string, string>, detail?: string) => Error
}
export interface PromptPlace {
  id: string; agent: string; labelKey: string; icon: ExtensionIcon
  scope: "workspace" | "global"; where: string
  forms: readonly { id: string; labelKey: string; removeLabelKey: string }[]
}
export interface PromptProvider {
  id: string
  places: readonly PromptPlace[]
  held(io: PromptIo, place: string, prompt: Prompt): Promise<Readonly<Record<string, boolean>>>
  install(io: PromptIo, place: string, prompt: Prompt, form: string, option?: string): Promise<void>
  remove(io: PromptIo, place: string, prompt: Prompt, form: string, option?: string): Promise<boolean>
}
export interface PluginDiskDeclaration {
  home: string
  homeEnv?: string
  state: string
  stateEnv?: string
  copyExcludeTop?: string[]
  copyRejectNested?: string[]
  lease?: {
    ref: PluginDiskRef
    stale: number
    update: number
    retries: { retries: number; factor: number; minTimeout: number; maxTimeout: number; randomize: boolean }
  }
  config: { write: string[]; read: string[] }
  stateFiles: { write: string[]; read: string[] }
  workspace: { write: string[]; read: string[] }
  library: { write: string[]; read: string[] }
  external: string[]
}
export interface PluginDiskRoots {
  declaration: PluginDiskDeclaration; config: string; plugins: string; workspace: string | null
  library: string; platform: "win32" | "posix"; token?: string
}
export interface PluginDiskRef { root: "config" | "plugins" | "workspace" | "library"; path: string }
export interface PluginDiskChange { ref: PluginDiskRef; before: string | null; after: string | null }
export interface PluginJournalCommit {
  pending: PluginDiskRef
  journal?: { ref: PluginDiskRef; prepared: string; swapped: string; committed: string }
  before: readonly PluginDiskChange[]
  commit: PluginDiskChange
  after: readonly PluginDiskChange[]
  artifact?: {
    operation: "copy" | "remove"; name: string; destination: string
    sourceSnapshot?: string; before: string | null; staging?: PluginDiskRef; backup: PluginDiskRef; manifests?: readonly string[]
  }
}
export interface PluginDisk {
  roots(declaration: PluginDiskDeclaration): Promise<PluginDiskRoots>
  list?(roots: PluginDiskRoots, ref: PluginDiskRef): Promise<{ name: string; directory: boolean }[]>
  path?(roots: PluginDiskRoots, ref: PluginDiskRef): Promise<string>
  read(roots: PluginDiskRoots, ref: PluginDiskRef): Promise<string | null>
  readExternal(roots: PluginDiskRoots, directory: string, relative: string): Promise<string | null>
  snapshotDirectory(roots: PluginDiskRoots, ref: PluginDiskRef): Promise<string | null>
  journalCommit?(roots: PluginDiskRoots, recipe: PluginJournalCommit): Promise<{ committed: boolean; warnings: string[] }>
  commit(roots: PluginDiskRoots, changes: readonly PluginDiskChange[], copy?: { name: string; destination: string; manifests?: readonly string[]; sourceSnapshot?: string; before?: string | null }, remove?: { ref: PluginDiskRef; before: string | null }): Promise<void>
  run<T>(declaration: PluginDiskDeclaration, work: (roots: PluginDiskRoots) => Promise<T>): Promise<T>
}
export interface PluginTools { disk?: PluginDisk; run(program: string, args: readonly string[]): Promise<string>; has(program: string): Promise<boolean> }
export interface PluginHeld {
  name: string; id: string; version: string; scope: string; enabled?: boolean; readOnly?: boolean
  marketplace: string | null; source?: { kind: "local"; path: string }; sourceAvailable?: boolean
  pack: { name: string; version: string; description: string }
}
export interface PluginInstallReport { message: string; location?: string; warning?: string }
export interface PluginInstaller {
  id: string; label: string
  places: readonly { id: string; label: string; scope: "workspace" | "global"; scopeWord: "user" | "project" | "local"; switchable: boolean; file: string; overrides?: readonly string[] }[]
  available(tools: PluginTools): Promise<boolean>
  held(tools: PluginTools): Promise<PluginHeld[]>
  switches(tools: PluginTools): Promise<Record<string, Record<string, boolean>>>
  install(name: string, scope: "user" | "project" | "local", tools: PluginTools): Promise<PluginInstallReport>
  remove(id: string, scope: "user" | "project" | "local", tools: PluginTools): Promise<PluginInstallReport>
  setEnabled(id: string, scope: "user" | "project" | "local", on: boolean, tools: PluginTools): Promise<PluginInstallReport>
}

export interface QoderScope {
  skills: { register(provider: SkillProvider): unknown }
  prompts: { tools: PromptTools; register(provider: PromptProvider): unknown }
  mcp: { tools: McpTools; register(provider: McpProvider): unknown }
  plugins: { registerManifests(paths: readonly string[]): unknown; register(installer: PluginInstaller): unknown }
  targets: { register(target: AgentTargetDescriptor): unknown }
  locales: { register(locale: LocaleContribution): unknown }
}
