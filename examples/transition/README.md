# Transition

Seven side-by-side transition scenarios: CSS class transitions, custom durations, JS-only animations, appear-on-mount, lifecycle hooks, and animated list reordering with `TransitionGroup`.

## What it demonstrates

- `Transition` with `name` — CSS class-based enter/leave transitions (`fade`, `slide`) driven by classes defined in `src/style.css` ([docs](../../docs/en/guide/transition.md))
- `duration` prop — asymmetric timing (`{ enter: 200, leave: 400 }`) for the scale scenario ([docs](../../docs/en/guide/transition.md))
- `css={false}` with `onEnter`/`onLeave` — JS-only animation via the Web Animations API, calling `done` when finished ([docs](../../docs/en/guide/transition.md))
- `appear` — animating the first mount, not just later toggles ([docs](../../docs/en/guide/transition.md))
- JS lifecycle hooks — `onBeforeEnter`, `onAfterEnter`, `onBeforeLeave`, `onAfterLeave` incrementing a visible call counter ([docs](../../docs/en/guide/transition.md))
- `TransitionGroup` — keyed list with enter/leave animations and FLIP move animations on reorder ([docs](../../docs/en/guide/transition.md))

## Run

```bash
pnpm install        # once, from the repo root
pnpm -C examples/transition dev
```

## Key code

Everything lives in [`src/main.tsx`](src/main.tsx), with the transition classes (`fade-*`, `slide-*`, `scale-*`, `list-*`) in [`src/style.css`](src/style.css). Each scenario is a section with a toggle button flipping a `$`-prefixed boolean; the `Transition` children are render functions (`{() => $show && <div .../>}`) so the component observes the condition and orchestrates enter/leave.

Scenario 4 disables CSS handling entirely (`css={false}`) and animates opacity through `element.animate(...)`, resolving the transition by calling the provided `done` callback when `finished` settles. Scenario 6 wires all four JS hooks to a counter rendered in the page so you can watch each phase fire.

Scenario 7 uses `TransitionGroup` with `each={() => $listItems}` and `key={(it) => it.id}`: Add/Remove animate item enter/leave, and "Shuffle" performs a deterministic last-to-first reorder so the FLIP move animation always triggers. Item ids stay unique so leave-then-re-enter and move animations have stable identity.
