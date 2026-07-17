# Provide

Provides shared state once at the root and injects it in multiple consumers — both a direct child and a component nested one level deeper.

## What it demonstrates

- `provide` — registering values (a reactive counter and a theme object) under symbol keys at the root component ([docs](../../docs/en/api/provide-inject.md))
- `inject` — reading provided values in descendant components, with a default fallback when a key is missing ([docs](../../docs/en/api/provide-inject.md))
- `reactive` — a shared mutable counter object whose updates propagate to every consumer ([docs](../../docs/en/api/reactive.md))
- `createApp` — mounting the app ([docs](../../docs/en/api/runtime-api.md))

## Run

```bash
pnpm install        # once, from the repo root
pnpm -C examples/provide dev
```

## Key code

Everything lives in [`src/main.tsx`](src/main.tsx). `App` creates a `reactive({ count: 0 })` object and calls `provide(CounterKey, counter)` and `provide(ThemeKey, { name: 'ocean' })` using `Symbol` keys.

The `Consumer` component calls `inject` for both keys — each with a default value as the second argument — and renders the theme name and shared count. It is used twice: directly under `App` (`slot="root"`) and inside the intermediate `NestedScope` component (`slot="nested"`), showing that injection resolves through any depth of the component tree.

Clicking "Increment shared count" mutates `counter.count` on the single reactive object, and both consumers update in lockstep because they injected the same instance.
