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
  order: number
}

export interface SkillProvider {
  id: string
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

export interface TraeScope {
  skills: { register(provider: SkillProvider): unknown }
  targets: { register(target: AgentTargetDescriptor): unknown }
  locales: { register(locale: LocaleContribution): unknown }
  mcp: { tools: McpTools; register(provider: McpProvider): unknown }
  prompts: { tools: PromptTools; register(provider: PromptProvider): unknown }
}

export interface Prompt { name: string; description: string; prompt: string }
export interface PromptTools {
  slugOf(name: string): string
  describeBody(body: string): string
  commandFile(input: { name: string; description: string; body: string; frontmatter: boolean }): string
  PromptError: new (key: string, params?: Record<string, string>, detail?: string) => Error
}
export interface PromptIo {
  files: {
    read(ref: { scope: "workspace" | "global"; file: string }): Promise<string | null>
    write(ref: { scope: "workspace" | "global"; file: string }, text: string): Promise<void>
    remove(ref: { scope: "workspace" | "global"; file: string }): Promise<void>
  }
}
export interface PromptProvider {
  id: string
  places: readonly { id: string; agent: string; labelKey: string; icon: ExtensionIcon; scope: "workspace" | "global"; order: number; where?: string; forms: readonly { id: string; labelKey: string; removeLabelKey?: string }[] }[]
  held(io: PromptIo, place: string, prompt: Prompt): Promise<Readonly<Record<string, boolean>>>
  install(io: PromptIo, place: string, prompt: Prompt, form: string, option?: string): Promise<void>
  remove(io: PromptIo, place: string, prompt: Prompt, form: string, option?: string): Promise<boolean>
}

export type McpDeclaration =
  | { transport: "stdio"; command: string; args: string[]; env: Record<string, string> }
  | { transport: "http" | "sse"; url: string; headers: Record<string, string> }

export interface McpIo {
  files: {
    read(ref: { scope: "workspace" | "global"; file: string }): Promise<string | null>
    write(ref: { scope: "workspace" | "global"; file: string }, text: string): Promise<void>
  }
  log(level: "info" | "warn" | "error", message: string): void
}

export interface McpTools {
  McpError: new (key: string, params?: Record<string, string>, detail?: string) => Error
  readJsonObject(text: string | null): Record<string, unknown> | null
  editJson(text: string | null, path: readonly (string | number)[], value: unknown): string
  jsonValueLines(text: string, path: readonly (string | number)[]): [number, number] | null
  parseToml(text: string): Record<string, unknown>
  setTomlEntry(text: string, table: string, name: string, values: Record<string, string | boolean | string[] | Record<string, string>>): string
  clearTomlEntry(text: string, table: string, name: string): string
  tomlEntryLines(text: string, table: string, name: string): [number, number] | null
}

export interface McpProvider {
  id: string
  places: readonly { id: string; label: string; switchable: boolean; scope: "workspace" | "global"; file: string }[]
  read(io: McpIo, place: string): Promise<{ name: string; declaration: McpDeclaration | null; enabled: boolean }[]>
  install(io: McpIo, place: string, name: string, declaration: McpDeclaration): Promise<void>
  uninstall(io: McpIo, place: string, name: string): Promise<void>
  locate(io: McpIo, place: string, name: string): Promise<[number, number] | null>
}
