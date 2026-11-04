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
