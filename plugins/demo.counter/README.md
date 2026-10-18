# demo.counter

A minimal extension written as a normal React component.

- `src/index.tsx` is the source. It imports `react` and uses JSX like any other
  React project.
- `index.js` is the build output committed alongside it, so the hub needs no
  build tools to install this plugin.
- `plugin.json` is the kernel manifest. `id` must equal the directory name.

## Build

```sh
pnpm install
pnpm build
```

The build marks `react`, `react-dom`, `react/jsx-runtime` and
`react/jsx-dev-runtime` as external. The hub serves those names from its own
React instance through the page's import map, so the plugin must not bundle
them.

Do not edit `index.js` by hand; change `src/index.tsx` and rebuild.
