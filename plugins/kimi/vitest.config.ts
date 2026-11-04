import { fileURLToPath } from "node:url"
import { defineProject } from "vitest/config"

export default defineProject({
  resolve: { alias: {
    "react/jsx-runtime": fileURLToPath(new URL("./__test__/react-jsx.ts", import.meta.url)),
    "react/jsx-dev-runtime": fileURLToPath(new URL("./__test__/react-jsx.ts", import.meta.url)),
  } },
  test: { name: "kimi", include: ["__test__/**/*.test.ts"] },
})
