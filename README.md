# Context Hub Extensions

A first-party extension market for Context Hub. The repository is static: the
hub reads `marketplace.json` over HTTPS and installs one plugin directory at a
time, pinned to a git commit.

## Layout

```text
marketplace.json          the index the hub reads
icons/                    list images shown before a plugin is installed
plugins/<id>/             one extension per directory; <id> equals plugin.json's id
  plugin.json             kernel manifest
  src/                    source (not installed; kept for development)
  index.js                committed build output (installed)
  README.md               what this plugin does
tools/build-extension.mjs builds src/index.tsx into index.js
tools/hash-extension.mjs  computes the integrity value stored in the index
```

A plugin directory is copied to the hub as-is. Only `plugin.json` and the files
it names (plus anything the plugin reads at runtime) matter after install;
`src/` and `README.md` are harmless passengers.

## Write a plugin

1. Copy `plugins/demo.counter` and change the directory name, `plugin.json`'s
   `id`, and the entry code. The directory name must equal the id.
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
4. Build and commit the output:

   ```sh
   pnpm install
   pnpm build
   ```

5. Add the plugin to `marketplace.json` (see below) and commit the plugin
   directory first. The commit recorded in the index must contain that
   directory.

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
          "source": {
            "type": "git",
            "url": "https://github.com/example/context-hub-extensions",
            "commit": "<40-character commit SHA>",
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
- `source.type` is `git`; `url` must be `https:`; `commit` is a full 40-char
  lowercase SHA; `path` stays inside the repository.
- `integrity` is the output of `tools/hash-extension.mjs` for the plugin
  directory at that commit.
- The first listed version is the recommended one.

## Updating a plugin

1. Change `src/index.tsx` and rebuild `index.js`.
2. Commit the plugin directory.
3. Compute the new `integrity` and point the version entry at the new commit.
4. Commit `marketplace.json`.

The index and the plugin must be in the same repository. A commit recorded in
the index must be reachable from a branch: the hub fetches that exact SHA with
`git fetch --depth 1 <url> <commit>`.

## Replace the placeholder URL

`marketplace.json` currently points at
`https://github.com/example/context-hub-extensions`. Replace it with the real
repository URL before publishing. The URL must not contain credentials, a query
or a fragment.

## Trust

The hub treats a market as first-party, trusted content. It pins a commit and
verifies the directory hash, but it does not sign or sandbox plugin code, and
`permissions` in the manifest are display-only. Only add indexes you control.
