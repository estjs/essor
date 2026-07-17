# For List Example

Side-by-side comparison of keyed `<For>` rendering versus plain `.map()` over the same reactive array — observing DOM node identity with creation-time stamps.

## What it demonstrates

- `For` — keyed list rendering with `key` and `fallback` props ([docs](../../docs/en/api/runtime-api.md))
- Reactive array mutations (`push`, `unshift`, `pop`, `splice`) driving both lists
- Observing node identity: each row is stamped with a `data-mounted-at` attribute (module-level counter) via a `ref` callback at DOM-node creation time
- `<For>`'s identity semantics: same key **and** same object → node reused in place; same key but a **new** object → the row scope is re-rendered so it sees the new data

## Run

```bash
pnpm install                       # once, from the repo root
pnpm -C examples/for-list dev
```

## Key code

`src/main.tsx` renders the same reactive `$items` array twice and stamps every `<li>` on creation:

- **Shuffle** reorders the same item objects — both lists keep their original stamps (nodes are moved, not recreated). `<For>` does this with keyed LIS-based moves and per-row reactive scopes; the generic reconciler matches by object identity.
- **Refresh labels** replaces every entry with a *new* object carrying the same `id`. `<For>` matches the key but detects the identity change (`Object.is`) and deliberately re-renders the row — fresh stamps in both lists. This is documented framework semantics, verified by `e2e/for-list.spec.ts`.
- Removing all items shows `<For>`'s `fallback` slot; adding again swaps it back for rows.

Beyond node reuse, `<For>` gives each row an isolated reactive scope (signals/effects created in `children(item, index)` are disposed when the row is removed) and warns on duplicate keys in development.
