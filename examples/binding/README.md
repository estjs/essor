# Binding

Two-way form bindings on every common input type — text, number, textarea, checkbox, select (single and multiple), range, and file — with modifier options.

## What it demonstrates

- `bind:value` — two-way binding for text inputs, textareas, selects, and ranges ([docs](../../docs/en/guide/bind.md))
- `bind:value={[state, { trim, number, lazy }]}` — binding modifiers that trim input, coerce to number, or commit on blur ([docs](../../docs/en/guide/bind.md))
- `bind:checked` — checkbox binding ([docs](../../docs/en/guide/bind.md))
- `bind:files` — file input binding to a `FileList` ([docs](../../docs/en/guide/bind.md))
- `$`-prefixed variables — compiler-tracked reactive state ([docs](../../docs/en/api/signal.md))
- `createApp` — mounting the app ([docs](../../docs/en/api/runtime-api.md))

## Run

```bash
pnpm install        # once, from the repo root
pnpm -C examples/binding dev
```

## Key code

Everything lives in [`src/main.tsx`](src/main.tsx). The `App` component declares one `$`-prefixed reactive variable per form control (`$name`, `$age`, `$bio`, `$slug`, `$subscribed`, `$theme`, `$focusAreas`, `$progress`, `$files`) and wires each to an input with the matching `bind:` directive.

Modifiers are passed as a tuple: `bind:value={[$name, { trim: true }]}` trims whitespace, `{ number: true }` coerces the age and range values to numbers, and `{ lazy: true }` makes the slug field commit on blur instead of every keystroke.

The multi-select binds `$focusAreas` (a string array) so selected options stay in sync both ways, and the file input uses `bind:files` to expose the chosen `FileList`. The `summary()` helper serializes all bound state into a live JSON `<pre>` block so you can watch every binding update as you interact with the form.
