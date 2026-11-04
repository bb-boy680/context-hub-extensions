export function jsx(type: unknown, props: unknown) {
  return { type, props }
}
export const jsxs = jsx
export const jsxDEV = jsx
export const Fragment = Symbol.for("react.fragment")
