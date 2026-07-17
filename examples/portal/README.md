# Portal

Moves one reactive block between two off-site targets — or renders it back inline — using a `Portal` with reactive `target` and `disabled` props.

## What it demonstrates

- `Portal` — rendering children into a DOM node outside the component tree ([docs](../../docs/en/components/Portal.md))
- Reactive `target` — a function prop (`() => $secondary ? '#secondary-target' : '#primary-target'`) that relocates the portal content live ([docs](../../docs/en/components/Portal.md))
- Reactive `disabled` — toggling the portal off so children render inline at their origin ([docs](../../docs/en/components/Portal.md))
- `bind:value` — the note text stays reactive wherever the block is mounted ([docs](../../docs/en/guide/bind.md))

## Run

```bash
pnpm install        # once, from the repo root
pnpm -C examples/portal dev
```

## Key code

Everything lives in [`src/main.tsx`](src/main.tsx). The `App` component renders three containers: an "Origin panel" that owns the `Portal`, plus `#primary-target` and `#secondary-target` divs.

The `Portal`'s `target` prop is a function of `$secondary`, so clicking "Move to secondary target" reparents the card between the two targets without remounting its state. The `disabled` prop is a function of `$inline`; when disabled, the card renders inline inside the origin panel instead of teleporting.

The card's content is a `$note` string bound to a text input with `bind:value`, proving the same reactive state keeps updating regardless of where the portal places the DOM.
