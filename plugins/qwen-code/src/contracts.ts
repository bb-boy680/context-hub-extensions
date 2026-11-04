export type ExtensionIcon = (props: { className?: string; "aria-hidden"?: boolean }) => unknown

export interface SkillPlace {
  id: string
  labelKey: string
  icon: ExtensionIcon
  scope: "workspace" | "global"
  dir: string
}

export type McpDeclaration =
  | { transport: "stdio"; command: string; args: string[]; env: Record<string, string> }
  | { transport: "sse" | "http"; url: string; headers: Record<string, string> }
export type FileRef = { scope: "workspace" | "global"; file: string }
export interface McpIo {
  files: { read(ref: FileRef): Promise<string | null>; write(ref: FileRef, text: string): Promise<void> }
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
  places: readonly (FileRef & { id: string; label: string; switchable: boolean; installable?: boolean })[]
  read(io: McpIo, place: string): Promise<{ name: string; declaration: McpDeclaration | null; enabled: boolean }[]>
  install(io: McpIo, place: string, name: string, declaration: McpDeclaration): Promise<void>
  uninstall(io: McpIo, place: string, name: string): Promise<void>
  locate(io: McpIo, place: string, name: string): Promise<[number, number] | null>
}

export interface QwenScope {
  skills: { register(provider: { id: string; places: SkillPlace[] }): unknown }
  mcp: { tools: McpTools; register(provider: McpProvider): unknown }
  prompts: { tools: PromptTools; register(provider: PromptProvider): unknown }
  plugins: { registerManifests(paths: readonly string[]): unknown; register(installer: PluginInstaller): unknown }
  targets: { register(target: { id: string; displayName: string; icon: ExtensionIcon; supports: readonly string[]; locations: readonly { label: string; path: string }[]; format: string }): unknown }
  locales: { register(locale: { id: string; label: string; messages: Record<string, string> }): unknown }
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
  enabled?: boolean
  readOnly?: boolean
  sourceAvailable?: boolean
  marketplace: string | null
  source?: { kind: "local"; path: string }
  pack: PackDescription
}

export interface PluginInstallReport {
  message: string
  location?: string
  output?: string
  warning?: string
}

export type PluginSwitches = Record<string, Record<string, boolean>>

export interface PluginDiskDeclaration {
  home: string; homeEnv?: string; homeEnvResolution?: "workspace"; canonicalWorkspace?: boolean; state: string; stateEnv?: string
  lease?: { ref: PluginDiskRef; stale: number; update: number; retries: { retries: number; factor: number; minTimeout: number; maxTimeout: number; randomize: boolean } }
  config: { write: readonly string[]; read: readonly string[] }
  stateFiles: { write: readonly string[]; read: readonly string[] }
  directories?: readonly string[]
  workspace: { write: readonly string[]; read: readonly string[] }
  library: { write: readonly string[]; read: readonly string[] }
  external: readonly string[]
}
export interface PluginDiskRoots {
  declaration: PluginDiskDeclaration; config: string; plugins: string; workspace: string | null; workspaceCanonical?: string | null; library: string; platform: "win32" | "posix"; token?: string
}
export interface PluginDiskRef { root: "config" | "plugins" | "workspace" | "library"; path: string }
export interface PluginDiskChange { ref: PluginDiskRef; before: string | null; after: string | null }
export interface PluginJournalCommit {
  pending: PluginDiskRef
  guardEmpty?: readonly PluginDiskRef[]
  journal?: { ref: PluginDiskRef; prepared: string; swapped: string; committed: string }
  before: readonly PluginDiskChange[]
  commit: PluginDiskChange
  after: readonly PluginDiskChange[]
  artifact?: { operation: "copy" | "remove"; name: string; destination: string; sourceSnapshot?: string; before: string | null; staging?: PluginDiskRef; backup: PluginDiskRef; manifests?: readonly string[] }
}
export interface PluginDisk {
  roots(scope: PluginDiskDeclaration): Promise<PluginDiskRoots>
  read(roots: PluginDiskRoots, ref: PluginDiskRef): Promise<string | null>
  list(roots: PluginDiskRoots, ref: PluginDiskRef, options?: { includeLinks?: boolean }): Promise<{ name: string; directory: boolean }[]>
  path(roots: PluginDiskRoots, ref: PluginDiskRef): Promise<string>
  snapshotDirectory(roots: PluginDiskRoots, ref: PluginDiskRef): Promise<string | null>
  removeDirectory(roots: PluginDiskRoots, ref: PluginDiskRef): Promise<void>
  commit(roots: PluginDiskRoots, changes: readonly { ref: PluginDiskRef; before: string | null; after: string | null }[], copy?: { name: string; destination: string; replace?: boolean; manifests?: readonly string[]; before?: string | null; sourceSnapshot?: string }, remove?: { ref: PluginDiskRef; before: string | null }): Promise<void>
  journalCommit(roots: PluginDiskRoots, recipe: PluginJournalCommit): Promise<{ committed: boolean; warnings: string[] }>
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
  clearEnabled?(id: string, scope: PluginInstallScope, tools: PluginTools): Promise<PluginInstallReport>
  setEnabled?(
    id: string,
    scope: PluginInstallScope,
    on: boolean,
    tools: PluginTools
  ): Promise<PluginInstallReport>
}

