import type {
  PluginDiskRoots,
  PluginHeld,
  PluginInstaller,
  PluginPlace,
  PluginTools,
} from "./contracts.ts"
import { bundleManifest, bundleNameParts, profileBundleState, type BundleManifest } from "./bundle-state.ts"
import { DEEPSEEK_HARNESS_ID } from "./locations.ts"
import { profileId } from "./mcp-places.ts"

/** 只读声明：profile 清单与依赖包元数据；不声明可写目录。 */
const DECLARATION = {
  home: ".dsh",
  homeEnv: "DSH_HOME",
  state: "profiles",
  config: {
    write: [],
    read: [
      "profiles",
      "profiles/*/package.json",
      "profiles/*/node_modules/*/package.json",
      "profiles/*/node_modules/*/*/package.json",
    ],
  },
  stateFiles: { write: [], read: [] },
  workspace: { write: [], read: [] },
  library: { write: [], read: [] },
  directories: [],
  external: [],
}

function profilePlaces(names: readonly string[]): PluginPlace[] {
  return names.map((profile) => ({
    id: profileId(profile),
    label: `DeepSeek Harness · ${profile}`,
    scope: "global" as const,
    scopeWord: "user" as const,
    switchable: false,
    installable: false,
    initialInstallable: false,
  }))
}

async function readBundle(
  tools: PluginTools,
  roots: PluginDiskRoots,
  profile: string,
  name: string
): Promise<BundleManifest | null> {
  const disk = tools.disk
  const parts = bundleNameParts(name)
  if (parts === null || disk === undefined) return null
  const base = `profiles/${profile}/node_modules`
  const path = parts.length === 2
    ? `${base}/${parts[0]}/${parts[1]}/package.json`
    : `${base}/${parts[0]}/package.json`
  const raw = await disk.read(roots, { root: "config", path }).catch(() => null)
  const parsed = bundleManifest(raw)
  return parsed?.name === name ? parsed : null
}

/** 只读安装器：列出已初始化 profile 及其 bundle 选择，不写任何文件。 */
export function createDeepSeekHarnessInstaller(): PluginInstaller {
  const install = async (tools: PluginTools): Promise<readonly PluginPlace[]> => {
    const disk = tools.disk
    if (disk === undefined) return []
    const roots = await disk.roots(DECLARATION)
    const entries = await disk.list(roots, { root: "config", path: "profiles" })
    const names: string[] = []
    for (const entry of entries) {
      if (!entry.directory) continue
      const raw = await disk
        .read(roots, { root: "config", path: `profiles/${entry.name}/package.json` })
        .catch(() => null)
      if (profileBundleState(raw) !== null) names.push(entry.name)
    }
    return profilePlaces(names)
  }

  return {
    id: DEEPSEEK_HARNESS_ID,
    label: "DeepSeek Harness",
    places: [],
    placesFor: install,
    async available(tools) {
      return (await install(tools)).length > 0
    },
    async held(tools) {
      const disk = tools.disk
      if (disk === undefined) return []
      const roots = await disk.roots(DECLARATION)
      const entries = (await disk.list(roots, { root: "config", path: "profiles" }))
        .filter((entry) => entry.directory)
      const packs: PluginHeld[] = []
      for (const entry of entries) {
        const state = profileBundleState(
          await disk
            .read(roots, { root: "config", path: `profiles/${entry.name}/package.json` })
            .catch(() => null)
        )
        if (state === null) continue
        const placeId = profileId(entry.name)
        for (const name of [...new Set([...state.selected, ...Object.keys(state.dependencies)])]) {
          const bundle = await readBundle(tools, roots, entry.name, name)
          packs.push({
            name: bundle?.name ?? name,
            id: `${name}@deepseek-harness:${entry.name}`,
            version: bundle?.version ?? "",
            scope: "user",
            placeId,
            enabled: state.selected.includes(name),
            readOnly: true,
            origin: "record",
            marketplace: null,
            pack: {
              name: bundle?.name ?? name,
              version: bundle?.version ?? "",
              description: bundle?.description ?? "",
            },
          })
        }
      }
      return packs
    },
    async install() {
      throw new Error("DeepSeek Harness bundles require dependency preparation; this hub does not install them yet")
    },
    async remove() {
      throw new Error("DeepSeek Harness bundles are read-only in this hub")
    },
  }
}
