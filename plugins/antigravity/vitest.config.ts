import { defineProject } from "vitest/config"

export default defineProject({
  test: { name: "antigravity", include: ["__test__/**/*.test.ts"] },
})
