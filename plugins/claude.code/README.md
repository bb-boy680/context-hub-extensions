# claude.code

Claude Code as a Context Hub extension. Installing it registers the places
Claude Code reads skills and prompts from, its MCP files, the plugin installer
the Plugins page drives, and the target descriptor the shell uses.

```text
package.json    package metadata; version and main (lib/index.js)
plugin.yaml     kernel manifest; no version or entry
build.mjs       esbuild build into lib/index.js
tsconfig.json   type checking for src/
src/index.tsx   brand mark and the apply(scope) registrations
src/locations.ts  where Claude Code keeps its files
src/provider.ts   Claude Code's MCP file reader/writer
src/installer.ts  Claude Code's plugin installer
src/messages.ts   English strings for the rows
assets/icon.svg   the image the market index inlines
lib/index.js    committed build output the hub loads
README.md       this file
```

## Build

```sh
pnpm install
pnpm build
```

From this directory `pnpm build` builds only this plugin. Run `pnpm build` at
the repository root to build every plugin and regenerate `marketplace.json`.

`lib/index.js` is committed because Context Hub installs by cloning the
repository and importing the entry file directly. Raise the version in
`package.json` only — never in `plugin.yaml`.

The plugin imports nothing but `react`; the hub maps that name to its own
instance through the page's import map. Everything else arrives through the
services named in `plugin.yaml`'s `inject`.
