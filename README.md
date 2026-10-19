# Context Hub Extensions

A first-party extension market for Context Hub. The repository is a pnpm
workspace: every plugin under `plugins/` is a complete, independently
buildable package, and the hub reads the generated `marketplace.json` to list
and install one plugin directory at a time.

## Layout

```text
marketplace.yaml             hand-written market metadata (title, repository, author)
marketplace.json             generated on main by CI; never edit by hand
scripts/build-marketplace.mjs
plugins/<id>/                one complete plugin project; <id> equals plugin.yaml's id
  package.json               project metadata; version and `main` are the only source
  plugin.yaml                identity, Context Hub version range, presentation, permissions, services
  build.mjs                  esbuild build into lib/index.js
  tsconfig.json              type checking for src/
  src/                       source
  assets/                    icons and other pictures the plugin ships
  lib/index.js               generated on main by CI; ignored on source branches
  README.md                  what this plugin does
pnpm-workspace.yaml          plugins/* are workspace packages
```

Context Hub installs by cloning the repository's default branch and importing
the entry file directly. The main branch therefore carries `lib/` and
`marketplace.json`, but they are produced by the build workflow, not committed
from a source branch. `.gitignore` keeps them out of local commits; the bot
commit on main is the only copy the hub reads.

## Write a plugin

1. Copy `plugins/claude.code` for a plugin with a React surface, or
   `plugins/skills.sh` for one that only registers a service. Change the
   directory name, `package.json`'s `name` and `version`, `plugin.yaml`'s `id`
   and metadata, and the entry code. The directory name must equal the manifest
   id.
2. Write the entry in `src/index.tsx` when it renders React, or `src/index.ts`
   when it does not. A React entry looks like:

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
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   ```

   The generated `lib/` and `marketplace.json` are ignored; do not commit them.

5. Keep `package.json`'s `main` pointing at the built entry
   (normally `lib/index.js`). Do not add `version` or `entry` to
   `plugin.yaml`; the hub refuses a manifest that declares them.
6. Commit the source only. The main-branch workflow builds and commits
   `lib/index.js` and `marketplace.json`.

## `plugin.yaml`

```yaml
id: skills.sh
name:
  en: skills.sh
  zh-cn: skills.sh
engines:
  contextHub: ">=0.0.1-beta.5 <0.7.0"
description:
  en: Search the public skills.sh catalog and install a result into this hub.
  zh-cn: 搜索公开的 skills.sh 技能目录，并把结果安装到本 hub。
icon: assets/icon.svg
category: source
permissions: [network]
inject: [skillRegistries]
```

- `name` and `description` are a string or a locale table with an `en` entry.
- `engines.contextHub` is required: the npm semver range of Context Hub
  versions this plugin supports, e.g. `">=0.1.0 <0.7.0"`. The hub compares it
  with its own application version and refuses to install or update a package
  outside the range.
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
- `versions[0].version` is `package.json.version`; `engines` is copied from
  `plugin.yaml.engines`.
- `source` points at the repository's `plugins/<id>` directory.
- the icon is inlined as a `data:image/...;base64,` URL.
- plugins are sorted by id; no timestamps, so two builds are byte-identical.

Rules enforced by the generator:

- `plugin.json` must not exist; the format is `plugin.yaml`.
- `plugin.yaml` must not declare `version` or `entry`.
- `plugin.yaml.engines.contextHub` must be a non-empty semver range.
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

Do not commit that variant, or any other `marketplace.json`; the CI-built index
on main names the published HTTPS repository.

## Updating a plugin

1. Change `src/` and raise the version in the plugin's `package.json`.
2. Commit the source only.
3. Merge to main. The workflow runs lint, typecheck, test and build, then
   commits `lib/` and `marketplace.json` back to main.

The index and the plugins must be in the same repository; the hub clones its
default branch.

## CI

`.github/workflows/build-market.yml` runs on every push to main: install,
lint, typecheck, test, build, then commit the generated `lib/` and
`marketplace.json` back as `github-actions[bot]`. `[skip ci]` and an actor guard
keep that commit from starting another run.

The workflow needs write access to main. If branch protection blocks direct
pushes, allow the Actions bot to bypass it; otherwise the commit step fails and
main keeps the old artifacts. A human push while a build is running can make the
bot push non-fast-forward; the next push rebuilds. Do not force-push.

## Trust

The hub treats a market as first-party, trusted content. It checks that the
index version equals `package.json` and that permissions match the manifest,
but it does not sign or sandbox plugin code, and `permissions` in the manifest
are display-only. Only add indexes you control.
