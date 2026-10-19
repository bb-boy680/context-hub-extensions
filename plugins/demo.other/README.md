# demo.other

A complete plugin project whose `apply` contributes nothing. It exists to try
the market's install and uninstall flow with a second entry.

```text
package.json    package metadata; main is the runtime entry (lib/index.js)
build.mjs       esbuild build into lib/index.js
tsconfig.json   type checking for src/
src/index.ts    source
plugin.json     kernel manifest; entry must equal package.json main
lib/index.js    committed build output the hub loads
README.md       this file
```

## Build

```sh
pnpm install
pnpm build
```

`lib/index.js` is committed because Context Hub installs by cloning the
repository and importing the entry file directly. After changing the source,
run `pnpm build`, raise the version in `package.json` and `plugin.json`
together, and update the version entry in `marketplace.json`.
