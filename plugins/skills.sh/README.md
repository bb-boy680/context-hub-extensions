# skills.sh

Skills from the public [skills.sh](https://www.skills.sh) catalog, searchable
from the Skills page and installable through the hub library.

Installing this plugin registers a remote skill registry. The Skills page's
**Explore** dialog then asks it for results; choosing a row installs it with the
same `npx skills add <repo> --skill <id>` path as any other package, so the
files land in the hub's own library.

```text
package.json      package metadata; version and main (lib/index.js)
plugin.yaml       kernel manifest; no version or entry
build.mjs         esbuild build into lib/index.js
tsconfig.json     type checking for src/ and __test__/
vitest.config.ts  the registry unit tests
src/index.ts      the apply(scope) implementation
src/contracts.ts  the hub service shapes this plugin reads, mirrored
__test__/         canned HTTP answers for search, paging and descriptions
assets/icon.svg   the image the market index inlines
lib/index.js      committed build output the hub loads
README.md         this file
```

## Why two endpoints

- `https://skills.sh/api/search?q=…` is the unauthenticated search route. It
  carries the skill's repository, id and install count, but no description.
- The description is the skill's own page meta description at
  `https://www.skills.sh/<owner>/<repo>/<skill>`, so `describe` reads one page
  per row and caches the answer.

Both requests go through `ctx.host.net`; the site serves no CORS header, so the
host process makes the request.

## Build

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

From this directory `pnpm build` builds only this plugin. Run `pnpm build` at
the repository root to build every plugin and regenerate `marketplace.json`.

`lib/index.js` is committed because Context Hub installs by cloning the
repository and importing the entry file directly. Raise the version in
`package.json` only — never in `plugin.yaml`.
