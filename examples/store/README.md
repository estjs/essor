# Essor Store Example

A shopping-cart store built with `createStore` (state + getters + actions), shared by two sibling components to demonstrate cross-component state.

## APIs demonstrated

- [`createStore`](../../docs/zh/api/store.md) — options-based store with `state`, `getters`, and `actions`
- Reactive getters — `totalQuantity` and `totalPrice` are computed from state and update automatically
- Actions with `this` — actions mutate state through `this` and notify in a single batch

## Run

```bash
pnpm install            # at the repo root (links workspace packages)
pnpm -C examples/store dev
```

The dev server prints its URL (during e2e it runs on port 4113).

## Key code (src/main.tsx)

- **Store definition** — `useCartStore = createStore({ state, getters, actions })` at module top. `createStore` returns a *factory*: each call creates a fresh store instance, so the example calls it once (`const cart = useCartStore()`) at module level and both components import that single instance.
- **`ProductList`** — calls the `addItem` action; existing products get their `quantity` bumped in place (reactive array item mutation), new ones are pushed.
- **`CartSummary`** — renders the `totalQuantity` / `totalPrice` getters and `items.length`, plus a `clear` action.
- **Cross-component sync** — clicking "Add Apple" in `ProductList` immediately updates the counts rendered in `CartSummary`, because both read from the same reactive store instance.
