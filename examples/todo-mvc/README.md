# TodoMVC

A client-only TodoMVC implementation covering add, inline edit, toggle, filter, toggle-all, and clear-completed flows on a reactive array.

## What it demonstrates

- `$`-prefixed reactive state — including a reactive array (`$todos`) mutated with `push`, `splice`, and index assignment ([docs](../../docs/en/api/signal.md))
- Derived functions — `visibleTodos()`, `remainingCount()`, `completedCount()`, `allCompleted()` computed inline from reactive state ([docs](../../docs/en/api/computed.md))
- `bind:value` — two-way binding on the new-todo and edit inputs ([docs](../../docs/en/guide/bind.md))
- Conditional list rendering — per-item edit mode, filter buttons with `aria-pressed`, and `map`-based list output
- `createApp` — mounting the app ([docs](../../docs/en/api/runtime-api.md))

## Run

```bash
pnpm install        # once, from the repo root
pnpm -C examples/todo-mvc dev
```

## Key code

Everything lives in [`src/main.tsx`](src/main.tsx). The `$todos` array is mutated directly — `push` to add, `splice` to remove, and index assignment (`$todos[index] = updater(...)`) to update — and the UI tracks all of these mutations.

Filtering is a plain derived function: `visibleTodos()` returns the subset matching the `$filter` state (`all` / `active` / `completed`), which the list `map`s over. Footer counts (`remainingCount`, `completedCount`) derive the same way.

Inline editing is modeled with `$editingId` and `$editingText`: clicking Edit swaps a row into an input bound with `bind:value`, Enter or Save commits via `saveEdit` (deleting the todo if the text is emptied), and Escape or Cancel restores view mode. `toggleAll` and `clearCompleted` round out the standard TodoMVC behaviors.
