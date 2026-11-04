import { existsSync, promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { describe, expect, it } from "vitest"
import { createWorkBuddyInstaller } from "../src/installer.ts"

const host = path.resolve(import.meta.dirname, "../../../../dsh-context-hub/packages/resources/plugins/src/host")
const jsonFile = path.resolve(import.meta.dirname, "../../../../dsh-context-hub/packages/resources/mcp/src/jsonc.ts")

describe("real host disk port", () => {
  it.skipIf(!existsSync(host))("copies a native-only pack into an isolated home and records it", async () => {
    const { createInstallerFiles } = await import(pathToFileURL(path.join(host, "installer-files.ts")).href)
    const { createFsPluginLibrary } = await import(pathToFileURL(path.join(host, "library.ts")).href)
    const { writeMarketplaceIndexes } = await import(pathToFileURL(path.join(host, "marketplace.ts")).href)
    const json = await import(pathToFileURL(jsonFile).href)
    const root = await fs.mkdtemp(path.join(tmpdir(), "workbuddy-host-"))
    try {
      const home = path.join(root, "hub")
      const userHome = path.join(root, "user")
      const folder = path.join(root, "workspace")
      const stage = path.join(root, "source")
      await fs.mkdir(folder, { recursive: true })
      await fs.mkdir(path.join(stage, ".codebuddy-plugin"), { recursive: true })
      await fs.writeFile(path.join(stage, ".codebuddy-plugin", "plugin.json"), JSON.stringify({ name: "demo", version: "1.0.0" }))
      const library = createFsPluginLibrary(home)
      await library.add("demo", stage, { kind: "local", path: root }, "fixture", [".codebuddy-plugin/plugin.json"])
      const disk = createInstallerFiles({ library, workspace: async () => folder, userHome, env: {} })
      const tools = {
        disk, root: async () => library.root,
        packs: async () => [{ name: "demo", version: "1.0.0", description: "demo" }],
        syncMarketplace: async (indexes: unknown) => writeMarketplaceIndexes(library.root, indexes),
        describe: async (_dir: string, name: string) => ({ name, version: "1.0.0", description: "demo" }),
        run: () => { throw new Error("CLI invoked") }, has: () => { throw new Error("CLI invoked") },
      }
      await createWorkBuddyInstaller(json).install("demo", "user", tools)
      const installed = path.join(userHome, ".workbuddy", "plugins", "cache", "context-hub", "demo", "1.0.0", ".codebuddy-plugin", "plugin.json")
      expect(JSON.parse(await fs.readFile(installed, "utf8"))).toEqual({ name: "demo", version: "1.0.0" })
      const registry = JSON.parse(await fs.readFile(path.join(userHome, ".workbuddy", "plugins", "installed_plugins.json"), "utf8"))
      expect(registry.plugins["demo@context-hub"][0].scope).toBe("user")
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
