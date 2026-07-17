# HMR

A hot-module-replacement workbench: edit source modules while the dev server runs and watch component boundaries hot-swap without losing counter state or reloading the page.

## What it demonstrates

- Component HMR via `unplugin-essor` — editing `App.tsx` or `components/CounterWorkbench.tsx` re-renders the component boundary in place
- `signal` — reactive workbench state (`count`, `updates`, `lastAction`) that survives hot updates ([docs](../../docs/en/api/signal.md))
- Hot-data state preservation — `src/demo-state.ts` stashes its signals in `hot.data` on dispose and restores them on the next module evaluation
- Bundler-agnostic hot API — `src/hot-api.ts` normalizes `import.meta.hot` (Vite) and `import.meta.webpackHot` (Rspack) behind one `getHotApi` helper
- Update instrumentation — the workbench listens for the `essor:hmr-update` event and counts applied hot updates in the UI

## Run

```bash
pnpm install        # once, from the repo root
pnpm -C examples/hmr dev            # Vite dev server
pnpm -C examples/hmr dev:rspack     # Rspack dev server (same sources)
```

Then edit `src/demo-content.ts` (labels, version string) or `src/components/CounterWorkbench.tsx` and watch the UI update. The counter value, the "Runtime updates" counter, and the last-action label persist across hot swaps.

## Key code

[`src/demo-state.ts`](src/demo-state.ts) is the heart of the state-preservation story: it creates three signals, but first checks `hot.data.workbenchState` so a hot update reuses the previous module instance's signals instead of resetting them. Its `dispose` callback writes the state back into `hot.data` and removes the `essor:hmr-update` listener. Multiple boundary updates within one edit are debounced (25 ms) before incrementing the visible update counter.

[`src/components/CounterWorkbench.tsx`](src/components/CounterWorkbench.tsx) renders the interactive counter (increment/decrement/reset with derived double and parity values) plus a `ModuleBoundaryPanel` showing boundary metadata pulled from [`src/demo-content.ts`](src/demo-content.ts) — the file you are meant to edit during a demo. [`src/components/DormantBoundary.tsx`](src/components/DormantBoundary.tsx) is a component that is imported for its constant but never rendered, exercising the "dormant boundary" HMR path.

## Rspack variant and e2e

The e2e suite runs this example through both bundlers. The Rspack test ([`e2e/hmr-rspack.spec.ts`](../../e2e/hmr-rspack.spec.ts)) reuses this example's sources by copying them into a temp directory and pointing [`rspack.config.mjs`](rspack.config.mjs) at it via the `RSPACK_E2E_FIXTURE` environment variable — the config's `context`, `entry`, and HTML template all resolve against that directory when the variable is set, and fall back to the example root otherwise. The `temp/` and `temp-rspack/` directories are transient test-run workspaces and are gitignored.
