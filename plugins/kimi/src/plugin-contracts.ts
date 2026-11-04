export interface PluginDiskDeclaration {
  home: string
  homeEnv?: string
  state: string
  config: { write: string[]; read: string[] }
  stateFiles: { write: string[]; read: string[] }
  workspace: { write: string[]; read: string[] }
  library: { write: string[]; read: string[] }
  directories: string[]
  external: string[]
}
export interface PluginDiskRoots {
  declaration: PluginDiskDeclaration
  config: string
  plugins: string
  workspace: string | null
  library: string
  platform: "win32" | "posix"
}
export interface PluginDiskRef { root: "config" | "plugins" | "workspace" | "library"; path: string }
export interface PluginDiskChange { ref: PluginDiskRef; before: string | null; after: string | null }
export interface PluginDisk {
  roots(declaration: PluginDiskDeclaration): Promise<PluginDiskRoots>
  read(roots: PluginDiskRoots, ref: PluginDiskRef): Promise<string | null>
  path(roots: PluginDiskRoots, ref: PluginDiskRef): Promise<string>
  snapshotDirectory(roots: PluginDiskRoots, ref: PluginDiskRef): Promise<string | null>
  commit(roots: PluginDiskRoots, changes: readonly PluginDiskChange[], copy?: {
    name: string; destination: string; replace?: boolean; manifests?: readonly string[]; before?: string | null; sourceSnapshot?: string
  }): Promise<void>
  run<T>(declaration: PluginDiskDeclaration, work: (roots: PluginDiskRoots) => Promise<T>): Promise<T>
}
export interface PluginTools {
  disk?: PluginDisk
  has(program: string): Promise<boolean>
  root(): Promise<string>
  packs(): Promise<{ name: string; description: string; version: string }[]>
  describe(directory: string, name: string): Promise<{ name: string; version: string; description: string; icon?: string }>
}
export interface PluginHeld {
  name: string; id: string; version: string; scope: string; enabled: boolean
  marketplace: null; origin: "record"; source: { kind: "local"; path: string }
  pack: { name: string; version: string; description: string; icon?: string }
}
export interface PluginInstaller {
  id: string
  label: string
  places: readonly { id: string; label: string; scope: "global"; scopeWord: string; switchable: boolean; file: string }[]
  available(tools: PluginTools): Promise<boolean>
  held(tools: PluginTools): Promise<PluginHeld[]>
  switches(tools: PluginTools): Promise<Record<string, Record<string, boolean>>>
  install(name: string, scope: string, tools: PluginTools): Promise<{ message: string; location?: string }>
  remove(id: string, scope: string, tools: PluginTools): Promise<{ message: string }>
  setEnabled(id: string, scope: string, on: boolean, tools: PluginTools): Promise<{ message: string }>
}
