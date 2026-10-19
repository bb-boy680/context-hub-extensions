# demo.counter

A complete plugin project written as a normal React component.

```text
package.json    package metadata; version and main (lib/index.js)
plugin.yaml     kernel manifest; no version or entry
build.mjs       esbuild build into lib/index.js
tsconfig.json   type checking for src/
src/index.tsx   source; imports React and uses JSX like any React project
assets/icon.svg the image the market index inlines
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
repository and importing the entry file directly. There is no npm publish step
that could carry the build output, so the built file has to be in git.

Do not edit `lib/index.js` by hand. Change `src/index.tsx`, run `pnpm build`,
then raise the version in `package.json` only — never in `plugin.yaml`.

React, `react-dom`, `react/jsx-runtime` and `react/jsx-dev-runtime` stay
external. The hub page maps those names to its own single React instance
through an import map; bundling a copy would break hooks.
