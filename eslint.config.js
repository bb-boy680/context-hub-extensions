import js from "@eslint/js"
import { defineConfig, globalIgnores } from "eslint/config"
import globals from "globals"
import tseslint from "typescript-eslint"

/**
 * The plugins are the product; generated bundles and the market index are
 * ignored, and build scripts run in Node while plugin sources run in the page.
 */
export default defineConfig([
  globalIgnores(["**/node_modules/**", "**/lib/**", "marketplace.json"]),
  {
    files: ["plugins/*/build.mjs"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["plugins/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
  },
])
