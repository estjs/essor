# Essor Watch & Effect Example

Interactive demo of Essor's imperative reactivity primitives: `watch` (with its options), `effect` with cleanup, and `untrack`.

## APIs demonstrated

- [`watch`](../../docs/zh/api/watch.md) — single source, `immediate` / `once` options, and the multi-source array form
- [`effect`](../../docs/zh/api/effect.md) — auto-tracking side effects whose returned function is invoked as a cleanup before every re-run
- [`untrack`](../../docs/zh/api/effect.md#untrack) — reading reactive values inside an effect without registering a dependency
- [`signal`](../../docs/zh/api/signal.md) — the underlying reactive sources

## Run

```bash
pnpm install            # at the repo root (links workspace packages)
pnpm -C examples/watch-effect dev
```

The dev server prints its URL (during e2e it runs on port 4112).

## Key code (src/main.tsx)

- **watch single source** — the first `watch(count, ...)` block appends `oldValue -> newValue` entries to a log signal, showing that the callback receives both values.
- **immediate** — the second watcher passes `{ immediate: true }`, so its log starts with `undefined -> 0` before any interaction.
- **once** — the `onceSource` watcher passes `{ once: true }`; the `once-calls` counter stays at 1 no matter how often the button is clicked, because the watcher stops itself after the first callback.
- **multi-source array** — `watch([firstSource, secondSource], ...)` receives a tuple of new values; each button click appends the current pair to the log.
- **effect + cleanup** — the effect reads `effectTick` and returns a function; Essor calls that returned function right before the next re-run, which the `cleanup-calls` counter makes visible (it always lags `effect-runs` by exactly one).
- **untrack** — the last effect reads `tracked` normally but reads `ignored` through `untrack(...)`. Incrementing `ignored` never re-runs the effect; its latest value only shows up after `tracked` changes.
