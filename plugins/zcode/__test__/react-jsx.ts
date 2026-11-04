export function jsx(type: unknown, props: Record<string, unknown>): unknown {
  return { type, props }
}
export const jsxs = jsx
export const jsxDEV = jsx
