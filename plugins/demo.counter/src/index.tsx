import React, { useState } from "react"

/** The part of the kernel this plugin uses; a plugin imports no hub package. */
interface PluginContext {
  header: {
    register(value: { id: string; order: number; Component: React.ComponentType }): void
  }
}

function Counter() {
  const [count, setCount] = useState(0)
  return (
    <button
      type="button"
      data-testid="demo-counter"
      style={{
        border: "1px solid #d7dbe2",
        borderRadius: 9999,
        background: "#fff",
        color: "#1f2937",
        cursor: "pointer",
        fontSize: 12.5,
        fontWeight: 500,
        padding: "4px 12px",
      }}
      onClick={() => setCount((value) => value + 1)}
    >
      count: {count}
    </button>
  )
}

export function apply(ctx: PluginContext) {
  ctx.header.register({ id: "demo.counter", order: 50, Component: Counter })
}
