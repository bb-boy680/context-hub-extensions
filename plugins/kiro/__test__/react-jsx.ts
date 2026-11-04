/**
 * The tag stand-in for the page's React runtime.
 *
 * Registration tests import `src/index.tsx`, which compiles its icon to a
 * jsx-runtime call. The hub supplies the real runtime; here the call only has
 * to produce a value the test can recognise.
 */
export function jsx(type: unknown, props: unknown, key?: unknown): unknown {
  return { type, props, key }
}

export const jsxs = jsx
export const jsxDEV = jsx
export const Fragment = Symbol.for("react.fragment")
