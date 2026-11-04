import { fileURLToPath } from "node:url"
import { defineProject } from "vitest/config"

const jsx = fileURLToPath(new URL("./__test__/react-jsx.ts", import.meta.url))
export default defineProject({
  resolve: { alias: { "react/jsx-runtime": jsx, "react/jsx-dev-runtime": jsx } },
  test: { name: "trae", include: ["__test__/**/*.test.ts"] },
})
