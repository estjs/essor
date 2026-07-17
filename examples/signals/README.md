# Signals

Explicit signal, computed, and batch APIs driving a greeting card and a counter with derived values.

## What it demonstrates

- `signal` — writable reactive values (`name`, `count`) read and written via `.value` ([docs](../../docs/en/api/signal.md))
- `computed` — derived values (`greeting`, `signature`, `double`, `parity`) that recalculate when their dependencies change ([docs](../../docs/en/api/computed.md))
- `batch` — grouping five sequential `count.value++` writes into one update flush ([docs](../../docs/en/api/batch.md))
- `createApp` — mounting the app ([docs](../../docs/en/api/runtime-api.md))

## Run

```bash
pnpm install        # once, from the repo root
pnpm -C examples/signals dev
```

## Key code

Everything lives in [`src/main.tsx`](src/main.tsx). Unlike the `$`-prefix examples, this one uses the explicit signal API: `signal('Essor')` and `signal(0)`, read via `.value` in JSX and written via `.value =` in event handlers (the name input uses a plain `oninput` handler rather than `bind:value`).

Four `computed` values derive from the two signals — `greeting` and `signature` from `name`, `double` and `parity` from `count` — and update automatically as you type or click.

The `addFiveInBatch` handler wraps a loop of five increments in `batch(...)`, so dependents observe a single consolidated update instead of five intermediate ones.
