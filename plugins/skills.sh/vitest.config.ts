import { defineProject } from "vitest/config"

/**
 * The registry logic is pure translation of two HTTP answers; the tests stand
 * in that port and need no browser, network or built bundle.
 */
export default defineProject({
  test: {
    name: "skills.sh",
    include: ["__test__/**/*.test.ts"],
  },
})
