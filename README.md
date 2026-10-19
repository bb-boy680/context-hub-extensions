# Context Hub Extensions

A first-party extension market for Context Hub. The repository is a pnpm
workspace: every plugin under `plugins/` is a complete, independently
buildable package, and the hub reads the generated `marketplace.json` to list
and install one plugin directory at a time.

## Layout

```text
marketplace.yaml             hand-written market metadata (title, repository, author)
marketplace.json             generated index; never edit by hand
scripts/build-marketplace.mjs
plugins/<id>/                one complete plugin project; <id> equals plugin.yaml's id
  package.json               project metadata; version and `main` are the only source
  plugin.yaml                identity, API version, presentation, permissions, services
  build.mjs                  esbuild build into lib/index.js
  tsconfig.json              type checking for src/
  src/                       source
  assets/                    icons and other pictures the plugin ships
  lib/index.js               committed build output the hub loads
  README.md                  what this plugin does
pnpm-workspace.yaml          plugins/* are workspace packages
```

`lib/` is committed because Context Hub installs by cloning the repository and
importing the entry file directly. Unlike an npm package, there is no publish
step that could carry the build output.

## Write a plugin

1. Copy `plugins/demo.counter` and change the directory name, `package.json`'s
   `name` and `version`, `plugin.yaml`'s `id` and metadata, and the entry code.
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

5. Keep `package.json`'s `main` pointing at the built entry
   (normally `lib/index.js`). Do not add `version` or `entry` to
   `plugin.yaml`; the hub refuses a manifest that declares them.
6. Commit the source, the built `lib/index.js`, and the regenerated
   `marketplace.json`.

## `plugin.yaml`

```yaml
id: demo.counter
name:
  en: Demo Counter
  zh-cn: 演示计数器
apiVersion: "^0.1"
description:
  en: Adds a counter to the header.
  zh-cn: 在标题栏里加一个计数器。
icon: assets/icon.svg
category: integration
permissions: [storage.self]
inject: [header]
```

- `name` and `description` are a string or a locale table with an `en` entry.
- `icon` must be an image inside the plugin directory for a market plugin. The
  generator inlines it into the index; a lucide name only works after install.
- `inject` lists every kernel service the plugin reads.

## `marketplace.yaml`

```yaml
title:
  en: Context Hub Extensions
  zh-cn: Context Hub 扩展
description:
  en: First-party extensions for Context Hub.
  zh-cn: Context Hub 的第一方扩展。
repository: https://github.com/bb-boy680/context-hub-extensions
author: Context Hub
```

`pnpm build` runs `scripts/build-marketplace.mjs`, which reads this file and
each `plugins/*/{plugin.yaml,package.json}` and writes `marketplace.json`:

- `title` / `description` come from this file.
- each plugin's `title` / `description` come from `plugin.yaml`.
- `versions[0].version` is `package.json.version`; `apiVersion` is
  `plugin.yaml.apiVersion`.
- `source` points at the repository's `plugins/<id>` directory.
- the icon is inlined as a `data:image/...;base64,` URL.
- plugins are sorted by id; no timestamps, so two builds are byte-identical.

Rules enforced by the generator:

- `plugin.json` must not exist; the format is `plugin.yaml`.
- `plugin.yaml` must not declare `version` or `entry`.
- `package.json.version` is required, and `main` (or `index.js`) must exist.
- `name` / `description` tables must include `en`.
- category and permission values must match the hub's enums.
- `marketplace.json` is refused when a plugin is incomplete, so a broken
  package never reaches the index.

For local verification against a checkout, generate an index whose source
points at that checkout instead of the published URL:

```sh
MARKETPLACE_REPOSITORY="$(pwd)" node scripts/build-marketplace.mjs
```

Do not commit that variant; the committed index must name the published HTTPS
repository.

## Updating a plugin

1. Change `src/` and run `pnpm build` from the repository root (this rebuilds
   every plugin and regenerates the index).
2. Raise the version in the plugin's `package.json`.
3. Commit the source, `lib/index.js` and `marketplace.json`.

The index and the plugins must be in the same repository; the hub clones its
default branch.

## Trust

The hub treats a market as first-party, trusted content. It checks that the
index version equals `package.json` and that permissions match the manifest,
but it does not sign or sandbox plugin code, and `permissions` in the manifest
are display-only. Only add indexes you control.
