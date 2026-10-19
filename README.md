# Context Hub Extensions

A first-party extension market for Context Hub. The repository is a pnpm
workspace: every plugin under `plugins/` is a complete, independently
buildable package, and the hub reads `marketplace.json` to list and install
one plugin directory at a time.

## Layout

```text
marketplace.json          the index the hub reads
icons/                    list images shown before a plugin is installed
plugins/<id>/             one complete plugin project; <id> equals plugin.json's id
  package.json            package metadata; main names the built entry
  build.mjs               esbuild build into lib/index.js
  tsconfig.json           type checking for src/
  src/                    source
  plugin.json             kernel manifest; entry equals package.json main
  lib/index.js            committed build output the hub loads
  README.md               what this plugin does
tools/hash-extension.mjs  computes the integrity value stored in the index
pnpm-workspace.yaml       plugins/* are workspace packages
```

`lib/` is committed because Context Hub installs by cloning the repository and
importing the entry file directly. Unlike an npm package, there is no publish
step that could carry the build output.

## Write a plugin

1. Copy `plugins/demo.counter` and change the directory name, `package.json`'s
   `name` and `version`, `plugin.json`'s `id` and `version`, and the entry code.
   The directory name must equal the manifest id.
2. Write normal React in `src/index.tsx`:

   ```tsx
   import React, { useState } from "react"

   export function apply(ctx: any) {
     ctx.header.register({ id: "my.plugin", order: 50, Component: Page })
   }
   ```

   React, `react-dom`, `react/jsx-runtime` and `react/jsx-dev-runtime` stay
   external. The hub page maps those names to its own single React instance
   through an import map; bundling a copy would break hooks.
3. Do not import any other package. UI components come from `ctx.ui`, icons
   from `ctx.icons` / `ctx.icon(name)`.
4. Build and check:

   ```sh
   pnpm install
   pnpm typecheck
   pnpm build
   ```

5. Keep `package.json`'s `main` and `plugin.json`'s `entry` identical
   (`lib/index.js`). The hub refuses to install a plugin whose two declarations
   disagree.
6. Add the plugin to `marketplace.json` (see below) and commit the source and
   the built `lib/index.js`.

## `marketplace.json`

```json
{
  "format": 1,
  "title": { "en": "Context Hub Extensions", "zh-cn": "Context Hub 扩展" },
  "plugins": [
    {
      "id": "demo.counter",
      "title": { "en": "Demo Counter", "zh-cn": "演示计数器" },
      "description": { "en": "Adds a counter to the header.", "zh-cn": "在标题栏里加一个计数器。" },
      "icon": "icons/demo.counter.svg",
      "author": "Context Hub",
      "category": "integration",
      "permissions": ["storage.self"],
      "versions": [
        {
          "version": "1.0.0",
          "apiVersion": "^0.1",
          "source": {
            "type": "git",
            "url": "https://github.com/example/context-hub-extensions",
            "path": "plugins/demo.counter"
          },
          "integrity": "<64-character directory hash>"
        }
      ]
    }
  ]
}
```

Rules enforced by the hub:

- `title` and `description` are strings or `{ "<locale>": "text" }` with an
  `en` entry; locale ids are lowercase (`zh-cn`, not `zh-CN`).
- `icon` is a relative path resolved against this file's URL, an absolute
  `https:` URL, or an inline `data:image/...;base64,` URL up to 32 KiB.
- `source.type` is `git`; `url` must be `https:`; `path` stays inside the
  repository.
- `integrity` is the output of `tools/hash-extension.mjs` for the plugin
  directory, including `lib/`. The hub clones the default branch and refuses an
  install whose hash differs, so update the index whenever the plugin changes.
- The first listed version is the recommended one.

## Updating a plugin

1. Change `src/index.tsx` and rebuild: `pnpm build`.
2. Compute the new `integrity`: `pnpm --filter <plugin> hash` or
   `node tools/hash-extension.mjs plugins/<id>`.
3. Update the version entry in `marketplace.json`.
4. Commit the plugin source, `lib/index.js` and `marketplace.json`.

The index and the plugins must be in the same repository; the hub clones its
default branch and checks the directory hash.

## Replace the placeholder URL

`marketplace.json` currently points at the local checkout
`D:/work-space/context-hub-extensions` so the market can be tested without a
network. Replace it with the real HTTPS repository URL before publishing. The
URL must not contain credentials, a query or a fragment.

## Trust

The hub treats a market as first-party, trusted content. It verifies the
directory hash, but it does not sign or sandbox plugin code, and `permissions`
in the manifest are display-only. Only add indexes you control.
