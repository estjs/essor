# Transition & TransitionGroup

Essor ships two built-in animation components:

- **`<Transition>`** — animate a *single* element as it mounts and unmounts.
- **`<TransitionGroup>`** — animate a *keyed list* of items: enter, leave, and
  position changes (FLIP).

Both components are CSS-class driven by default and accept JS hooks for full
imperative control.

## `<Transition>`

Wrap any conditional piece of UI in `<Transition>` and it will play
enter/leave animations automatically — you define the CSS classes, the runtime
handles the sequencing.

Capabilities at a glance:

- **CSS class transitions** — the classic 6-class `*-enter-*` / `*-leave-*` sequence
- **JS hooks** — `onBeforeEnter`, `onEnter(done)`, `onAfterEnter`, `onEnterCancelled`, and the leave equivalents
- **appear** — run the enter animation on the very first mount
- **duration override** — skip CSS event detection with an explicit millisecond value
- **cancellation** — mid-enter / mid-leave reversals are handled cleanly (no orphan elements)
- **`css={false}`** — opt out of class management entirely for Web Animations API or external libs
- **type detection** — force `transitionend` vs `animationend` when both are present

### Basic Usage

```tsx
import { signal } from 'essor'
import { Transition } from 'essor'

function Demo() {
  const $show = signal(true)

  return (
    <>
      <button onClick={() => ($show.value = !$show.value)}>Toggle</button>

      <Transition name='fade'>
        {() => $show.value && <div class='box'>Hello</div>}
      </Transition>
    </>
  )
}
```

```css
/* always on the -active class */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 300ms ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
```

The child is passed as a **function slot** — `() => $show.value && <div/>`. When
the expression evaluates to a falsy value (`false`, `null`, `undefined`, `0`),
`<Transition>` treats it as "no child" and triggers the leave animation on the
previously mounted element. When it turns truthy again, the enter animation runs.

### The `name` prop

`name` (default `'v'`) determines the CSS class prefix:

| `name`   | Enter classes                              | Leave classes                              |
| -------- | ------------------------------------------ | ------------------------------------------ |
| `'v'`    | `v-enter-from`, `v-enter-active`, `v-enter-to` | `v-leave-from`, `v-leave-active`, `v-leave-to` |
| `'fade'` | `fade-enter-from`, `fade-enter-active`, `fade-enter-to` | `fade-leave-from`, `fade-leave-active`, `fade-leave-to` |

### CSS Class Sequence

The runtime adds and removes classes in a precise two-frame sequence to let the
browser commit the initial style before the transition starts:

**Enter phase:**

```
frame 0 │ insert el into DOM
         │ add  name-enter-from
         │ add  name-enter-active
frame 1  │ (reflow — browser paints initial state)
         │ remove  name-enter-from
         │ add     name-enter-to
         │ wait for transitionend / animationend (or duration)
done     │ remove  name-enter-active
         │ remove  name-enter-to
         │ → onAfterEnter fires
```

**Leave phase** (mirror):

```
frame 0 │ add  name-leave-from
         │ add  name-leave-active
frame 1  │ remove  name-leave-from
         │ add     name-leave-to
         │ wait for transitionend / animationend (or duration)
done     │ remove  name-leave-active
         │ remove  name-leave-to
         │ el is removed from DOM
         │ → onAfterLeave fires
```

Put your `transition: ...` or `animation: ...` rule on the **`-active` class**;
the `-from` / `-to` classes define start/end values.

### JS Hooks

Eight hooks let you intercept every phase. They can be used alongside CSS classes
or in `css={false}` mode (see next section).

| Hook               | Signature                              | When it fires                                  |
| ------------------ | -------------------------------------- | ---------------------------------------------- |
| `onBeforeEnter`    | `(el: Element) => void`                | Before enter classes are added / el inserted   |
| `onEnter`          | `(el: Element, done: () => void) => void` | After reflow, at the start of the active phase |
| `onAfterEnter`     | `(el: Element) => void`                | After enter animation completes                |
| `onEnterCancelled` | `(el: Element) => void`                | Mid-enter leave was triggered                  |
| `onBeforeLeave`    | `(el: Element) => void`                | Before leave classes are added                 |
| `onLeave`          | `(el: Element, done: () => void) => void` | After reflow, at the start of the leave active phase |
| `onAfterLeave`     | `(el: Element) => void`                | After leave animation completes                |
| `onLeaveCancelled` | `(el: Element) => void`                | Mid-leave enter was triggered                  |

When you supply `onEnter` or `onLeave`, you are responsible for calling `done()`
to signal completion. `done()` is idempotent — calling it more than once is safe.

```tsx
<Transition
  name='slide'
  onEnter={(el, done) => {
    el.animate([{ transform: 'translateX(-100%)' }, { transform: 'translateX(0)' }], {
      duration: 300,
      easing: 'ease-out',
    }).finished.then(done)
  }}
  onLeave={(el, done) => {
    el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }], {
      duration: 300,
      easing: 'ease-in',
    }).finished.then(done)
  }}
>
  {() => $show.value && <div class='panel'>Panel</div>}
</Transition>
```

Hook order: `onBeforeEnter` → `onEnter(done)` → `onAfterEnter` (or
`onEnterCancelled` if interrupted before completion).

### `css={false}` — JS-Only Mode

Set `css={false}` to prevent `<Transition>` from touching any CSS classes at all.
Use this when you want to drive the animation entirely from JS — e.g. the
Web Animations API, motion-one, anime.js, GSAP, etc.

```tsx
<Transition
  css={false}
  onEnter={(el, done) => {
    el.animate(
      [{ opacity: 0, transform: 'scale(0.9)' }, { opacity: 1, transform: 'scale(1)' }],
      { duration: 250, easing: 'ease-out' },
    ).finished.then(done)
  }}
  onLeave={(el, done) => {
    el.animate(
      [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.9)' }],
      { duration: 200, easing: 'ease-in' },
    ).finished.then(done)
  }}
>
  {() => $visible.value && <div class='modal'>Modal</div>}
</Transition>
```

> Without JS hooks, `css={false}` causes the element to appear/disappear
> **instantly** — there is nothing to drive the animation.

### `duration` Prop

By default `<Transition>` detects the animation end event from `transitionend`
/ `animationend`. The `duration` prop overrides this with an explicit timeout (ms):

```tsx
{/* same duration for enter and leave */}
<Transition name='fade' duration={300}>
  {() => $show.value && <div />}
</Transition>

{/* different durations per direction */}
<Transition name='fade' duration={{ enter: 300, leave: 150 }}>
  {() => $show.value && <div />}
</Transition>
```

Use `duration` when your CSS uses the `all` shorthand (which can produce
spurious `transitionend` events for unrelated properties), or when you have a
complex chained animation and want deterministic timing.

### `appear` Prop

By default, the child on the **initial mount** skips the enter animation —
it simply appears in place. Set `appear` to animate it:

```tsx
<Transition name='fade' appear>
  {() => $show.value && <div>Animates in on first render too</div>}
</Transition>
```

The appear phase uses `appearFromClass` / `appearActiveClass` / `appearToClass`
when provided; otherwise it falls back to the regular `enter-*` classes:

```tsx
<Transition
  name='fade'
  appear
  appearFromClass='fade-appear-from'
  appearActiveClass='fade-appear-active'
  appearToClass='fade-appear-to'
>
  {() => <div>Always visible but fades in on first render</div>}
</Transition>
```

### `type` Prop

When an element has **both** a CSS `transition` and a CSS `animation`,
`<Transition>` picks the longer one. Override the detection with `type`:

```tsx
<Transition name='combo' type='animation'>
  {() => $show.value && <div />}
</Transition>
```

| `type`         | Listens for            |
| -------------- | ---------------------- |
| `'transition'` | `transitionend`        |
| `'animation'`  | `animationend`         |
| _(omitted)_    | whichever has a longer computed duration |

### Custom Class Names

If you are integrating with a third-party CSS framework (Animate.css, Tailwind
`transition`, etc.) you can override every class name individually:

| Prop                | Default                   |
| ------------------- | ------------------------- |
| `enterFromClass`    | `{name}-enter-from`       |
| `enterActiveClass`  | `{name}-enter-active`     |
| `enterToClass`      | `{name}-enter-to`         |
| `leaveFromClass`    | `{name}-leave-from`       |
| `leaveActiveClass`  | `{name}-leave-active`     |
| `leaveToClass`      | `{name}-leave-to`         |
| `appearFromClass`   | falls back to `enterFromClass`   |
| `appearActiveClass` | falls back to `enterActiveClass` |
| `appearToClass`     | falls back to `enterToClass`     |

```tsx
{/* Animate.css integration */}
<Transition
  enterActiveClass='animate__animated animate__fadeIn'
  leaveActiveClass='animate__animated animate__fadeOut'
  duration={500}
>
  {() => $show.value && <div>Animated with Animate.css</div>}
</Transition>
```

### Cancellation

`<Transition>` handles rapid toggling gracefully — it never double-mounts or
leaves orphan elements in the DOM.

**Mid-enter → leave (toggle off while entering):**

1. `onEnterCancelled(el)` fires.
2. Enter classes are removed immediately.
3. The leave animation starts from the element's current visual state.

**Mid-leave → enter (toggle on while leaving):**

1. `onLeaveCancelled(el)` fires.
2. Leave classes are removed.
3. The element is preserved in the DOM; the enter animation resumes.

### SSR

On the server, `<Transition>` renders its child as **plain static HTML** — no
animation classes are emitted to the HTML string. This is safe: the animation
classes are applied on the client after hydration.

- `appear={true}` triggers once after the client-side hydration completes.
- Leave/enter toggled during SSR render simply outputs the current child state.

### Constraints

- **Single root child only.** Passing an array of children throws in `__DEV__`:
  ```
  [essor] <Transition> expects a single root child. Use <TransitionGroup> for multiple children.
  ```
- **Non-element children are skipped.** Strings, numbers, and other non-`Element`
  values will log a warning in `__DEV__` and receive no animation.
- **Reactive slot shape.** The canonical child shape is a function:
  `{() => show.value && <div/>}`. The function is re-evaluated reactively; any
  truthy `Element` result mounts, any falsy result triggers the leave.

---

## `<TransitionGroup>`

`<TransitionGroup>` animates a **keyed list** with three coordinated animations:

- **enter** — newly added items fade/slide in using the `*-enter-*` classes
- **leave** — removed items animate out (pinned `position: absolute` so the
  remaining items can reflow freely), then detach from the DOM
- **move** — items that stayed but changed position run **FLIP**: snapshot
  positions before the reorder, compute the delta after, transform back to the
  old position, then transition to identity under `moveClass`

It accepts every per-item knob that `<Transition>` does (name, css, type,
duration, JS hooks, custom class overrides) plus a few list-specific props.

### Basic Usage

```tsx
import { signal } from 'essor'
import { TransitionGroup } from 'essor'

function TodoList() {
  const $items = signal([
    { id: 1, label: 'Buy milk' },
    { id: 2, label: 'Walk dog' },
  ])

  const add = () =>
    ($items.value = [...$items.value, { id: Date.now(), label: 'New' }])

  const remove = (id: number) =>
    ($items.value = $items.value.filter(i => i.id !== id))

  return (
    <>
      <button onClick={add}>Add</button>
      <TransitionGroup name='list' each={$items} key={item => item.id} tag='ul'>
        {(item) => (
          <li onClick={() => remove(item.id)}>{item.label}</li>
        )}
      </TransitionGroup>
    </>
  )
}
```

```css
/* enter / leave — same as Transition */
.list-enter-active,
.list-leave-active,
.list-move {
  transition: all 300ms ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
```

> `<TransitionGroup>` automatically pins leaving items with
> `position: absolute` and locks their `top` / `left` / `width` / `height` so
> the surrounding items reflow underneath. You do **not** need to write a
> `position: absolute` rule yourself.

### Required Props

| Prop       | Type                                                | Description                                                                  |
| ---------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| `each`     | `T[] \| Signal<T[]> \| () => T[]`                   | Source list. Reactive on change.                                             |
| `key`      | `(item: T, index: number) => unknown`               | Stable identity per row. Used to detect adds / removes / moves.              |
| `children` | `(item: T, index: number) => Element \| Component`  | Render function for one row. Must return a single root Element or Component. |

### Optional Props

| Prop        | Default              | Description                                                            |
| ----------- | -------------------- | ---------------------------------------------------------------------- |
| `tag`       | `'div'`              | Wrapper element. Provides the layout root for FLIP measurements.       |
| `moveClass` | `${name}-move`       | Class applied to items during the move animation.                      |

All other props from `<Transition>` are inherited — `name`, `css`, `type`,
`duration`, `enterFromClass` … `leaveToClass`, and the JS hooks below.

### Per-Item Hooks

The same hook set as `<Transition>` fires **per row**:

| Hook               | When it fires                            |
| ------------------ | ---------------------------------------- |
| `onBeforeEnter`    | Before enter classes are added to a new item   |
| `onEnter`          | At the start of the enter active phase         |
| `onAfterEnter`     | After enter animation completes                |
| `onEnterCancelled` | Mid-enter leave was triggered                  |
| `onBeforeLeave`    | Before leave classes are added                 |
| `onLeave`          | At the start of the leave active phase         |
| `onAfterLeave`     | After leave animation completes                |
| `onLeaveCancelled` | Mid-leave the same key was re-added            |

```tsx
<TransitionGroup
  name='list'
  each={$items}
  key={i => i.id}
  onEnter={(el, done) => {
    el.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 200 },
    ).finished.then(done)
  }}
>
  {(item) => <div class='card'>{item.label}</div>}
</TransitionGroup>
```

### The FLIP Move Animation

When the same key appears at a new index, the runtime executes a **FLIP**
pass on the row's element:

```
1. Snapshot getBoundingClientRect() BEFORE applying the new order.
2. Reorder DOM children to match the new list.
3. Snapshot getBoundingClientRect() AFTER. Compute delta (dx, dy).
4. Apply transform: translate(dx, dy) with transitionDuration: 0s. Reflow.
5. Add moveClass. Restore the original transitionDuration.
6. Clear the transform → browser animates back to identity.
7. Wait for transitionend, then remove moveClass.
```

The default `moveClass` is `${name}-move` (e.g. `list-move`). Add your
`transition` rule on it — typically the same one used for enter/leave:

```css
.list-move {
  transition: transform 300ms ease;
}
```

If `prevRect` and `newRect` are identical (the row did not move), the FLIP
step is skipped entirely.

### Component Children

The `children(item, index)` render function can return either an `Element` or
a `Component` instance. When it returns a Component:

- The component is mounted into the wrapper as a normal child.
- Its **first** rendered Element participates in enter/leave/move.
- If the component renders multiple roots, only the first animates — a dev
  warning is emitted.

```tsx
<TransitionGroup name='cards' each={$items} key={i => i.id}>
  {(item) => <Card data={item} />}  {/* Card is an Essor component */}
</TransitionGroup>
```

### Per-Row Scope & Cleanup

Each row's render function runs inside its **own reactive scope** (mirroring
`<For>`). Signals, effects, and `onScopeDispose` callbacks created inside
`children(item, index)` are torn down automatically when the row is removed —
not when the surrounding `<TransitionGroup>` unmounts.

### `css={false}`

Same semantics as `<Transition>` — disables all class management. Without JS
hooks, removed items detach **synchronously** (no leave animation) and added
items appear instantly.

### Initial Mount Is Silent

Items present in the first render do **not** animate in.
`<TransitionGroup>` does not honor `appear`. If you need a first-frame
animation, drive your own per-item enter via JS hooks on the second pass.

### Constraints

- **`key` must be stable and unique.** Two items returning the same key collide
  and the second is treated as a duplicate (no enter, lost identity on
  reconcile).
- **Render function must return a single root Element or Component.**
  Returning `null`, a string, or a number skips the row (with a dev warning).
- **Component children animate the first root only.** Fragment-style outputs
  will lose all but the first child.
- **No `appear`.** Initial-render items skip the enter animation. To animate
  the first frame, mount the group with an empty list and push items after
  mount, or drive your own JS hook.
- **`leave` pins position absolute.** If you customize `*-leave-active` styles,
  don't override `position` — the runtime owns it during leave.

### Common Patterns

**List with stagger:**

```tsx
<TransitionGroup
  name='list'
  each={$items}
  key={i => i.id}
  onEnter={(el, done) => {
    const i = Number((el as HTMLElement).dataset.index)
    setTimeout(done, 50 * i + 200)
  }}
>
  {(item, index) => (
    <li data-index={index}>{item.label}</li>
  )}
</TransitionGroup>
```

**Move-only animation (instant enter / leave):**

```css
.list-move {
  transition: transform 500ms cubic-bezier(0.22, 1, 0.36, 1);
}
/* Suppress enter/leave so only reorders animate. */
.list-enter-active,
.list-leave-active {
  transition: none;
}
```

---

## Common Errors

### 1. Multiple children inside `<Transition>`

```tsx
{/* ❌ throws in __DEV__ */}
<Transition name='fade'>
  {() => [<div key='a' />, <div key='b' />]}
</Transition>

{/* ✅ wrap in a single container — or use TransitionGroup for a list */}
<Transition name='fade'>
  {() => $show.value && (
    <div>
      <span>a</span>
      <span>b</span>
    </div>
  )}
</Transition>
```

### 2. Missing `-active` CSS

The animation silently skips if `-active` has no `transition` or `animation`
rule. The component functions correctly — the element appears/disappears
instantly — but no motion occurs.

```css
/* ❌ no rule — nothing to animate */
.fade-enter-from { opacity: 0; }

/* ✅ add the -active rule */
.fade-enter-active { transition: opacity 300ms; }
.fade-enter-from   { opacity: 0; }
```

### 3. `transition: all` without `type: 'transition'`

```css
.fade-enter-active { transition: all 300ms; }
```

This works, but `all` includes every animatable property. If any other property
changes during the transition it may fire a spurious `transitionend` event and
cut the animation short. Prefer explicit properties, or add `type='transition'`
to lock detection to `transitionend`.

### 4. `css={false}` without JS hooks

```tsx
{/* ❌ element appears / disappears with no animation */}
<Transition css={false}>
  {() => $show.value && <div />}
</Transition>

{/* ✅ provide onEnter / onLeave hooks */}
<Transition
  css={false}
  onEnter={(el, done) => { /* animate, then call done() */ }}
  onLeave={(el, done) => { /* animate, then call done() */ }}
>
  {() => $show.value && <div />}
</Transition>
```

### 5. `<TransitionGroup>` without a `moveClass` transition

```css
/* ❌ items snap to their new positions instead of animating */
.list-enter-active, .list-leave-active {
  transition: opacity 300ms;
}

/* ✅ also add a rule on .list-move */
.list-enter-active, .list-leave-active, .list-move {
  transition: all 300ms;
}
```

### 6. Non-unique keys

```tsx
{/* ❌ two items share key 0 — second one is treated as a duplicate */}
<TransitionGroup each={items} key={() => 0}>
  {item => <li>{item.label}</li>}
</TransitionGroup>

{/* ✅ derive a stable id per item */}
<TransitionGroup each={items} key={item => item.id}>
  {item => <li>{item.label}</li>}
</TransitionGroup>
```

---

## Best Practices

1. **Always define an `-active` rule** with an explicit `transition-duration` or
   `animation-duration`. Without it the component works but plays no animation.
2. **Use `duration` for deterministic timing** — especially when the CSS uses
   `transition: all` or chains multiple animated properties.
3. **Prefer `css={false}` + Web Animations API** for complex, sequenced, or
   physics-based animations. It gives you full imperative control while keeping
   the mount/unmount lifecycle managed by `<Transition>`.
4. **Animation classes are kebab-case** and their prefix follows the `name`
   prop — `name='myAnim'` produces `myAnim-enter-from`, not `my-anim-enter-from`.
5. **Keep the slot as a function** — `{() => cond && <El/>}` is the canonical
   shape. Passing a static node means `<Transition>` only ever sees "child
   present" and the leave path never fires.
6. **For appear-only animations** (e.g. page load fade), set `appear` and let
   the child always return the element from the slot function.
7. **In `<TransitionGroup>`, key by a stable identity** — `item.id`, not the
   array index. Index-keyed lists lose move animation entirely.
8. **Apply the same transition rule to `-enter-active`, `-leave-active`, and
   `-move`** for smooth, coherent list animations.
