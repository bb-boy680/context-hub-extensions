/**
 * Build one plugin's `src/index.tsx` into the `index.js` the hub installs.
 *
 * React and its runtime modules stay external: the hub page maps those names
 * to its own single React instance, and bundling a second copy would break
 * hooks.
 */
import { build } from "esbuild"
import path from "node:path"

const dir = process.argv[2]
if (dir === undefined) {
  console.error("usage: node tools/build-extension.mjs <plugin-dir>")
  process.exit(2)
}

await build({
  entryPoints: [path.join(dir, "src", "index.tsx")],
  outfile: path.join(dir, "index.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  external: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  logLevel: "info",
})
