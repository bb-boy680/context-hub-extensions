import { fileURLToPath } from "node:url"

import { defineProject } from "vitest/config"

/**
 * The providers are translations between Cursor's files and the hub's
 * contracts; the tests stand in those boundaries and need no browser, network
 * or real user directory. Registration tests import the JSX entry module, so
 * the page's React runtime is replaced by a tag stand-in.
 */
export default defineProject({
  resolve: {
    alias: {
      "react/jsx-runtime": fileURLToPath(new URL("./__test__/react-jsx.ts", import.meta.url)),
      "react/jsx-dev-runtime": fileURLToPath(new URL("./__test__/react-jsx.ts", import.meta.url)),
    },
  },
  test: {
    name: "cursor",
    include: ["__test__/**/*.test.ts"],
  },
})
