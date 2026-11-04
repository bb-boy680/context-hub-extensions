import path from "node:path"
import { pathToFileURL } from "node:url"
import { createQwenCodeInstaller } from "../../src/installer.ts"

const [checkout, root, stop, action = "install"] = process.argv.slice(2)
const load = relative => import(pathToFileURL(path.join(checkout, relative)).href)
const [{ createFsPluginLibrary }, { createInstallerFiles }, { writeFileAtomic }] = await Promise.all([
  load("packages/resources/plugins/src/host/library.ts"),
  load("packages/resources/plugins/src/host/installer-files.ts"),
  load("packages/core/src/host/atomic.ts"),
])
const library = createFsPluginLibrary(path.join(root, "hub"))
const disk = createInstallerFiles({
  library, workspace: async () => path.join(root, "work"), userHome: path.join(root, "user"), env: {},
  async write(file, text) {
    await writeFileAtomic(file, text)
    const phase = file.includes(`${path.sep}transactions${path.sep}`) ? JSON.parse(text).phase : path.basename(file) === ".context-hub-ownership.json" ? "ownership" : path.basename(file) === "state.json" ? "state_written" : ""
    if (phase === stop) {
      process.send?.("paused")
      await new Promise(() => {})
    }
  },
})
const forbidden = async () => { throw new Error("external operation forbidden") }
const tools = { disk, files: null, packs: async () => [], root: async () => library.root, syncMarketplace: forbidden, run: forbidden, has: forbidden, describe: forbidden }
const installer = createQwenCodeInstaller()
if (action === "remove") {
  const [held] = await installer.held(tools)
  if (!held) throw new Error("fixture has no installed extension")
  await installer.remove(held.id, "user", tools)
} else await installer.install("demo", "user", tools)
