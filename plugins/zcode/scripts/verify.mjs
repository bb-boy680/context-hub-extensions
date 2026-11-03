import { mkdtemp, cp, symlink, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const repository = path.resolve(source, "../..")
const temporary = await mkdtemp(path.join(tmpdir(), "zcode-check-"))
const plugin = path.join(temporary, "plugins/zcode")
const actions = process.argv.slice(2)
if (actions.length === 0 || actions.some((action) => !["test", "typecheck", "build", "lint", "marketplace"].includes(action))) {
  throw new Error("使用 verify.mjs test|typecheck|build|lint|marketplace，可传多个检查")
}
try {
  await cp(source, plugin, { recursive: true, filter: (file) => !["lib", "node_modules"].includes(path.basename(file)) })
  await symlink(path.join(source, "node_modules"), path.join(plugin, "node_modules"), "junction")
  await symlink(path.join(repository, "node_modules"), path.join(temporary, "node_modules"), "junction")
  await cp(path.join(repository, "eslint.config.js"), path.join(temporary, "eslint.config.mjs"))
  for (const action of actions) {
    if (action === "marketplace") {
      const build = spawnSync(process.execPath, [path.join(plugin, "build.mjs")], { cwd: plugin, stdio: "inherit" })
      if (build.error || build.status !== 0) throw build.error ?? new Error("临时市场构建失败")
      await cp(path.join(repository, "scripts"), path.join(temporary, "scripts"), { recursive: true })
      await cp(path.join(repository, "marketplace.yaml"), path.join(temporary, "marketplace.yaml"))
      const result = spawnSync(process.execPath, [path.join(temporary, "scripts/build-marketplace.mjs")], { cwd: temporary, env: { ...process.env, MARKETPLACE_REPOSITORY: temporary }, stdio: "inherit" })
      if (result.error || result.status !== 0) throw result.error ?? new Error("临时市场生成失败")
      const index = JSON.parse(await readFile(path.join(temporary, "marketplace.json"), "utf8"))
      const serialized = JSON.stringify(index)
      if (!serialized.includes('"id":"zcode"') || !serialized.includes('"path":"plugins/zcode"') || !serialized.includes('"version":"0.1.0"') || !serialized.includes("data:image/svg+xml;base64,")) throw new Error("临时市场缺少 ZCode 字段")
      console.log("仅 ZCode 独占临时市场字段检查通过")
      continue
    }
    const commands = {
      typecheck: [path.join(plugin, "node_modules/typescript/bin/tsc"), "--noEmit"],
      build: [path.join(plugin, "build.mjs")],
      test: [path.join(plugin, "node_modules/vitest/vitest.mjs"), "run"],
      lint: [path.join(repository, "node_modules/eslint/bin/eslint.js"), "--config", path.join(temporary, "eslint.config.mjs"), "plugins/zcode"],
    }
    console.log(`ZCode 临时副本 ${action}: ${plugin}`)
    const result = spawnSync(process.execPath, commands[action], {
      cwd: action === "lint" ? temporary : plugin,
      env: { ...process.env },
      stdio: "inherit",
    })
    if (result.error) throw result.error
      if (result.status !== 0) throw new Error(`${action} 退出码 ${result.status}`)
    if (action === "build") {
      const bundle = await readFile(path.join(plugin, "lib/index.js"), "utf8")
      const imports = [...bundle.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)].map((match) => match[1])
      if (imports.some((name) => !["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"].includes(name))) throw new Error(`构建产物有非 React 外部 import：${imports.join(", ")}`)
      console.log(`构建外部 import：${imports.join(", ") || "无"}`)
    }
  }
} finally {
  await rm(temporary, { recursive: true, force: true })
}
