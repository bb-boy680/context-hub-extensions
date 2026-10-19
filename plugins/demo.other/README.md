# demo.other

A complete plugin project whose `apply` contributes nothing. It exists to try
the market's install and uninstall flow with a second entry.

```text
package.json    package metadata; version and main (lib/index.js)
plugin.yaml     kernel manifest; no version or entry
build.mjs       esbuild build into lib/index.js
tsconfig.json   type checking for src/
src/index.ts    source
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
repository and importing the entry file directly. After changing the source,
run `pnpm build` and raise the version in `package.json` only.
