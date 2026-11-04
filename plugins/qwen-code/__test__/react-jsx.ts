export function jsx(type: unknown, props: unknown, key?: unknown): unknown {
  return { type, props, key }
}
export const jsxs = jsx
export const jsxDEV = jsx
export const Fragment = Symbol.for("react.fragment")
