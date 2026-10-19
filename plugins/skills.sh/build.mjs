/**
 * Build this plugin into the `lib/index.js` the hub installs.
 *
 * This plugin imports nothing at runtime: the contract types are erased, and
 * the host and registry arrive through the services named in `plugin.yaml`.
 * `absWorkingDir` keeps the bundle's path banner independent of the cwd, so
 * the same source produces the same bytes on every machine.
 */
import { build } from "esbuild"
import path from "node:path"
import { fileURLToPath } from "node:url"

const dir = path.dirname(fileURLToPath(import.meta.url))

await build({
  absWorkingDir: dir,
  entryPoints: ["src/index.ts"],
  outfile: path.join(dir, "lib", "index.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  logLevel: "info",
})
