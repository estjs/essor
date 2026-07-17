# Fragment

Renders multiple sibling table rows per data entry using JSX fragments, without introducing wrapper elements.

## What it demonstrates

- `<>...</>` fragments — returning sibling nodes (a summary row plus a detail row) from one map callback ([docs](../../docs/en/components/Fragment.md))
- `$`-prefixed variables — compiler-tracked reactive state driving the detail toggle ([docs](../../docs/en/api/signal.md))
- `createApp` — mounting the app ([docs](../../docs/en/api/runtime-api.md))

## Run

```bash
pnpm install        # once, from the repo root
pnpm -C examples/fragment dev
```

## Key code

Everything lives in [`src/main.tsx`](src/main.tsx). A static `rows` array is mapped inside `<tbody>`, and each entry returns a fragment containing two `<tr>` siblings — a summary row and a detail row. Because fragments add no wrapper element, the resulting DOM stays a valid flat list of `<tr>` children, which is exactly what a `<tbody>` requires.

The reactive `$showDetails` flag toggles the `hidden` attribute on each detail row, and `renderedRowCount()` derives the visible row count so the header label updates with the toggle.
