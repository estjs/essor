# Error Handling Example

Handling async failures with `createResource`'s `error` / `state` signals and `refetch()` retries — Essor's primary error-handling pattern.

> Essor has **no built-in `ErrorBoundary` component**. The idiomatic approach is inspecting the resource's `error` and `state` signals directly (see [Suspense § Error Handling](../../docs/en/components/Suspense.md)); a boundary-style wrapper, if desired, is a user-written component.

## What it demonstrates

- `createResource` error path — a flaky fetcher that rejects twice before succeeding ([docs](../../docs/en/components/Suspense.md))
- `resource.state` signal (`pending` → `errored` / `ready`) driving conditional UI
- `resource.error` signal exposing the rejection for display
- `actions.refetch()` for user-driven retries (aborting stale in-flight requests via `AbortSignal`)
- A stable resource side-by-side as the success-path control

## Run

```bash
pnpm install                       # once, from the repo root
pnpm -C examples/error-handling dev
```

## Key code

`src/main.tsx` creates two resources:

- **flaky** — `flakyFetcher` throws on its first two attempts, then resolves. The panel renders the error message from `resource.error.value` while `state` is `errored`; clicking **Retry** calls `refetch()`, and the third attempt lands the data.
- **stable** — always resolves; shows the `pending → ready` happy path for contrast.

`ResourcePanel` is a small presentational component that branches purely on `resource.state.value` — no try/catch, no boundary component; the signals carry the failure state.
