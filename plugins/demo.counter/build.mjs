/**
 * Build this plugin into the `lib/index.js` the hub installs.
 *
 * React and its runtime modules stay external: the hub page maps those names
 * to its own single React instance, and bundling a second copy would break
 * hooks. `absWorkingDir` keeps the bundle's path banner independent of the
 * cwd, so the same source produces the same bytes on every machine.
 */
import { build } from "esbuild"
import path from "node:path"
import { fileURLToPath } from "node:url"

const dir = path.dirname(fileURLToPath(import.meta.url))

await build({
  absWorkingDir: dir,
  entryPoints: ["src/index.tsx"],
  outfile: path.join(dir, "lib", "index.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  external: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  logLevel: "info",
})
