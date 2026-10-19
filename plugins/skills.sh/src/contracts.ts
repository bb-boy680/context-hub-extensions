/**
 * The hub plugin API this extension reads, mirrored locally.
 *
 * An installed plugin is a directory the hub clones and imports directly; it
 * cannot resolve `@context-hub/extensions`. These are the shapes that cross
 * the service boundary, copied from the hub's kernel types. They are erased at
 * build time, so the bundle imports nothing at runtime.
 */

/** One remote skill, as a search result row renders it. */
export interface RemoteSkill {
  name: string
  source?: string
  description?: string
  package?: string
  installs?: number
  tag?: string
}

/** One page of a registry's answer. */
export interface RegistryPage {
  items: RemoteSkill[]
  total?: number
  hasMore?: boolean
}

/** What the Skills page asks a registry for. */
export interface RegistryQuery {
  query: string
  offset: number
  limit: number
}

/** One remote registry a plugin makes searchable. */
export interface SkillRegistry {
  id: string
  name: string
  minQuery?: number
  search(request: RegistryQuery): Promise<RegistryPage>
  describe?(skill: RemoteSkill): Promise<Partial<RemoteSkill>>
}

/** One HTTP response fetched on the plugin's behalf by the host. */
export interface NetResponse {
  status: number
  body: string
}

/** The host's network port; `null` when the form cannot reach the network. */
export interface NetPort {
  request(url: string, init?: { headers?: Record<string, string> }): Promise<NetResponse>
}

/** The platform host the kernel provides to every plugin. */
export interface PluginHost {
  net: NetPort | null
  log(level: "info" | "warn" | "error", message: string): void
}

/** The contribution point a registry registers into. */
export interface SkillRegistryPoint {
  register(registry: SkillRegistry): void
}

/** What an installed plugin's `apply` receives. */
export interface PluginScope {
  host: PluginHost
  skillRegistries: SkillRegistryPoint
}
