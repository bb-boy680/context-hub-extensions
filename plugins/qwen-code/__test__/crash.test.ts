import { spawn } from "node:child_process"
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

const checkout = process.env.CONTEXT_HUB_CHECKOUT
const fixture = fileURLToPath(new URL("./fixtures/crash.mjs", import.meta.url))
const trees: string[] = []
afterEach(async () => { await Promise.all(trees.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

// The assertions follow extension-store.ts at Qwen Code commit 042c023b7beb4ad2a9ef95b2906b3564e3f23089.
describe.skipIf(!checkout || Number(process.versions.node.split(".")[0]) < 22)("Qwen transaction interruption", () => {
  it.each(["prepared", "artifact_swapped", "ownership", "state_written", "state_committed"])("preserves a recoverable journal at %s", async phase => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-crash-")); trees.push(root)
    const home = path.join(root, "hub"), work = path.join(root, "work"), userHome = path.join(root, "user"), stage = path.join(root, "stage")
    await Promise.all([mkdir(home), mkdir(work), mkdir(userHome), mkdir(stage)])
    await writeFile(path.join(stage, "qwen-extension.json"), JSON.stringify({ name: "demo", version: "1.0.0" }))
    await writeFile(path.join(stage, "component.md"), "fixture")
    const load = (relative: string) => import(pathToFileURL(path.join(checkout!, relative)).href)
    const [{ createFsPluginLibrary }, { createInstallerFiles }, { createQwenCodeInstaller }] = await Promise.all([
      load("packages/resources/plugins/src/host/library.ts"), load("packages/resources/plugins/src/host/installer-files.ts"), import("../src/installer.ts"),
    ])
    const library = createFsPluginLibrary(home)
    await library.add("demo", stage, { kind: "local", path: root }, "fixture", ["qwen-extension.json"])
    const child = spawn(process.execPath, ["--experimental-strip-types", fixture, checkout!, root, phase], { stdio: ["ignore", "ignore", "pipe", "ipc"] })
    let stderr = ""
    child.stderr?.on("data", chunk => { stderr += String(chunk) })
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`fixture timed out: ${stderr}`)), 10000)
        child.once("message", message => { clearTimeout(timer); if (message === "paused") resolve(); else reject(new Error(`unexpected message ${String(message)}`)) })
        child.once("exit", code => { clearTimeout(timer); reject(new Error(`fixture exited ${code}: ${stderr}`)) })
        child.once("error", error => { clearTimeout(timer); reject(error) })
      })
      const stopped = new Promise<void>(resolve => child.once("exit", () => resolve()))
      child.kill()
      await stopped
      const qwen = path.join(userHome, ".qwen"), store = path.join(qwen, "extension-store"), transactions = path.join(store, "transactions")
      const journals = await readdir(transactions)
      expect(journals).toHaveLength(1)
      const journalPath = path.join(transactions, journals[0]!)
      const journal = JSON.parse(await readFile(journalPath, "utf8"))
      const state = await readFile(path.join(store, "state.json"), "utf8").then(JSON.parse).catch(() => null)
      expect(journal.phase).toBe(phase === "ownership" || phase === "state_written" ? "artifact_swapped" : phase)
      expect(journal.targetSnapshot.generation).toBe(journal.targetGeneration)
      expect(journal.targetGeneration).toBe(journal.previousGeneration + 1)
      expect(journal.destinationDirectory).toBe(path.join(qwen, "extensions", "demo"))
      const staged = await stat(journal.stagingDirectory).catch(() => null)
      const destination = await stat(journal.destinationDirectory).catch(() => null)
      expect(Boolean(staged)).toBe(phase === "prepared")
      expect(Boolean(destination)).toBe(phase !== "prepared")
      expect(state !== null).toBe(phase === "state_written" || phase === "state_committed")

      // Apply the published recovery outcome for a fresh install; no Qwen process is run.
      if (state === null) await rm(journal.destinationDirectory, { recursive: true, force: true })
      await rm(journal.stagingDirectory, { recursive: true, force: true })
      await rm(journal.backupDirectory, { recursive: true, force: true })
      await rm(journalPath)
      await rm(path.join(store, "lock.lock"), { recursive: true, force: true })
      const disk = createInstallerFiles({ library, workspace: async () => work, userHome, env: {} })
      const forbidden = async () => { throw new Error("external operation forbidden") }
      const tools = { disk, files: null, packs: async () => [], root: async () => library.root, syncMarketplace: forbidden, run: forbidden, has: forbidden, describe: forbidden }
      const installer = createQwenCodeInstaller()
      if (state === null) await installer.install("demo", "user", tools)
      expect((await installer.held(tools))[0]).toMatchObject({ name: "demo", readOnly: false, enabled: true })
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill()
    }
  }, 20000)

  it("keeps old ownership after an interrupted update is rolled back", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-update-crash-")); trees.push(root)
    const home = path.join(root, "hub"), work = path.join(root, "work"), userHome = path.join(root, "user")
    await Promise.all([mkdir(home), mkdir(work), mkdir(userHome)])
    const load = (relative: string) => import(pathToFileURL(path.join(checkout!, relative)).href)
    const [{ createFsPluginLibrary }, { createInstallerFiles }, { createQwenCodeInstaller }] = await Promise.all([
      load("packages/resources/plugins/src/host/library.ts"), load("packages/resources/plugins/src/host/installer-files.ts"), import("../src/installer.ts"),
    ])
    const library = createFsPluginLibrary(home), origin = { kind: "local", path: root }
    const make = async (version: string) => {
      const dir = path.join(root, `stage-${version}`); await mkdir(dir)
      await writeFile(path.join(dir, "qwen-extension.json"), JSON.stringify({ name: "demo", version }))
      return dir
    }
    await library.add("demo", await make("1"), origin, "one", ["qwen-extension.json"])
    const disk = createInstallerFiles({ library, workspace: async () => work, userHome, env: {} })
    const forbidden = async () => { throw new Error("external operation forbidden") }
    const tools = { disk, files: null, packs: async () => [], root: async () => library.root, syncMarketplace: forbidden, run: forbidden, has: forbidden, describe: forbidden }
    const installer = createQwenCodeInstaller()
    await installer.install("demo", "user", tools)
    await library.replace("demo", await make("2"), origin, "two", ["qwen-extension.json"])
    const child = spawn(process.execPath, ["--experimental-strip-types", fixture, checkout!, root, "ownership"], { stdio: ["ignore", "ignore", "pipe", "ipc"] })
    let stderr = ""
    child.stderr?.on("data", chunk => { stderr += String(chunk) })
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`fixture timed out: ${stderr}`)), 10000)
        child.once("message", () => { clearTimeout(timer); resolve() })
        child.once("exit", code => { clearTimeout(timer); reject(new Error(`fixture exited ${code}: ${stderr}`)) })
        child.once("error", error => { clearTimeout(timer); reject(error) })
      })
      const stopped = new Promise<void>(resolve => child.once("exit", () => resolve()))
      child.kill(); await stopped
      const store = path.join(userHome, ".qwen", "extension-store"), transactions = path.join(store, "transactions")
      const journalPath = path.join(transactions, (await readdir(transactions))[0]!)
      const journal = JSON.parse(await readFile(journalPath, "utf8"))
      expect(journal.operation).toBe("update")
      expect(journal.phase).toBe("artifact_swapped")
      expect(JSON.parse(await readFile(path.join(store, "state.json"), "utf8")).generation).toBe(journal.previousGeneration)
      await rm(journal.destinationDirectory, { recursive: true })
      const { rename } = await import("node:fs/promises")
      await rename(journal.backupDirectory, journal.destinationDirectory)
      await rm(journalPath)
      await rm(path.join(store, "lock.lock"), { recursive: true, force: true })
      expect((await installer.held(tools))[0]).toMatchObject({ version: "1", readOnly: false })
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill()
    }
  }, 20000)

  it.each(["artifact_swapped", "state_committed"])("keeps uninstall consistent after interruption at %s", async phase => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-remove-crash-")); trees.push(root)
    const home = path.join(root, "hub"), work = path.join(root, "work"), userHome = path.join(root, "user"), stage = path.join(root, "stage")
    await Promise.all([mkdir(home), mkdir(work), mkdir(userHome), mkdir(stage)])
    await writeFile(path.join(stage, "qwen-extension.json"), JSON.stringify({ name: "demo", version: "1" }))
    const load = (relative: string) => import(pathToFileURL(path.join(checkout!, relative)).href)
    const [{ createFsPluginLibrary }, { createInstallerFiles }, { createQwenCodeInstaller }] = await Promise.all([
      load("packages/resources/plugins/src/host/library.ts"), load("packages/resources/plugins/src/host/installer-files.ts"), import("../src/installer.ts"),
    ])
    const library = createFsPluginLibrary(home)
    await library.add("demo", stage, { kind: "local", path: root }, "one", ["qwen-extension.json"])
    const disk = createInstallerFiles({ library, workspace: async () => work, userHome, env: {} })
    const forbidden = async () => { throw new Error("external operation forbidden") }
    const tools = { disk, files: null, packs: async () => [], root: async () => library.root, syncMarketplace: forbidden, run: forbidden, has: forbidden, describe: forbidden }
    const installer = createQwenCodeInstaller()
    await installer.install("demo", "user", tools)
    const child = spawn(process.execPath, ["--experimental-strip-types", fixture, checkout!, root, phase, "remove"], { stdio: ["ignore", "ignore", "pipe", "ipc"] })
    let stderr = ""
    child.stderr?.on("data", chunk => { stderr += String(chunk) })
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`fixture timed out: ${stderr}`)), 10000)
        child.once("message", () => { clearTimeout(timer); resolve() })
        child.once("exit", code => { clearTimeout(timer); reject(new Error(`fixture exited ${code}: ${stderr}`)) })
        child.once("error", error => { clearTimeout(timer); reject(error) })
      })
      const stopped = new Promise<void>(resolve => child.once("exit", () => resolve()))
      child.kill(); await stopped
      const store = path.join(userHome, ".qwen", "extension-store"), transactions = path.join(store, "transactions")
      const journalPath = path.join(transactions, (await readdir(transactions))[0]!)
      const journal = JSON.parse(await readFile(journalPath, "utf8"))
      const snapshot = JSON.parse(await readFile(path.join(store, "state.json"), "utf8"))
      expect(journal.operation).toBe("uninstall")
      expect(journal.stagingDirectory).toBeUndefined()
      expect(snapshot.generation).toBe(phase === "state_committed" ? journal.targetGeneration : journal.previousGeneration)
      if (phase === "artifact_swapped") {
        const { rename } = await import("node:fs/promises")
        await rename(journal.backupDirectory, journal.destinationDirectory)
      } else await rm(journal.backupDirectory, { recursive: true, force: true })
      await rm(journalPath)
      await rm(path.join(store, "lock.lock"), { recursive: true, force: true })
      if (phase === "artifact_swapped") expect((await installer.held(tools))[0]).toMatchObject({ name: "demo", readOnly: false })
      else {
        expect(await installer.held(tools)).toEqual([])
        await installer.install("demo", "user", tools)
        expect((await installer.held(tools))[0]).toMatchObject({ name: "demo", readOnly: false })
      }
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill()
    }
  }, 20000)
})
