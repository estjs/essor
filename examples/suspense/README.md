# Suspense

Async workspace panels behind two independent `Suspense` boundaries, each showing its own fallback while `createResource` data resolves — with abortable fetches when you switch workspaces.

## What it demonstrates

- `Suspense` — declarative loading fallbacks for async children; two sibling boundaries resolve independently ([docs](../../docs/en/components/Suspense.md))
- `createResource` — async data as a reactive accessor, with an `AbortSignal` passed to the fetcher for cancellation ([docs](../../docs/en/server/resources.md))
- `$`-prefixed variables — reactive workspace selection that swaps the suspended subtree ([docs](../../docs/en/api/signal.md))
- `createApp` — mounting the app ([docs](../../docs/en/api/runtime-api.md))

## Run

```bash
pnpm install        # once, from the repo root
pnpm -C examples/suspense dev
```

## Key code

Everything lives in [`src/main.tsx`](src/main.tsx). The `waitFor` helper simulates network latency with `setTimeout` and fully honors the `AbortSignal` handed to `createResource` fetchers — rejecting with an `AbortError` and cleaning up its timer and listener if the resource is torn down mid-flight (e.g. when you switch workspaces).

`ProfileCard` and `TimelineCard` each call `createResource((signal) => waitFor(..., delay, signal))` with different delays (500 ms and 750 ms) and read the result through the returned accessor (`profile()`, `items()`).

`WorkspacePanels` wraps each card in its own `Suspense` boundary with a distinct fallback, so the profile appears before the timeline. `App` keeps a `$workspace` selector (`alpha` / `beta` / `gamma`) and renders a fresh `WorkspacePanels` per selection, re-triggering both loads on every switch.
