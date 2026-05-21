# Transition — Two-Way Animation

`<Transition>` animates a single child element as it mounts and unmounts. Wrap
any conditional piece of UI in `<Transition>` and it will play enter/leave CSS
(or JS) animations automatically — you define the CSS classes, the runtime
handles the sequencing.

Capabilities at a glance:

- **CSS class transitions** — the classic 6-class `*-enter-*` / `*-leave-*` sequence
- **JS hooks** — `onBeforeEnter`, `onEnter(done)`, `onAfterEnter`, `onEnterCancelled`, and the leave equivalents
- **appear** — run the enter animation on the very first mount
- **duration override** — skip CSS event detection with an explicit millisecond value
- **cancellation** — mid-enter / mid-leave reversals are handled cleanly (no orphan elements)
- **`css={false}`** — opt out of class management entirely for Web Animations API or external libs
- **type detection** — force `transitionend` vs `animationend` when both are present

> `<TransitionGroup>` for animating lists is **not yet implemented** (planned).

## Basic Usage

```tsx
import { useSignal } from 'essor'
import { Transition } from 'essor'

function Demo() {
  const $show = useSignal(true)

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

## CSS Class Sequence

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

## JS Hooks

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

## `css={false}` — JS-Only Mode

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

## `duration` Prop

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

## `appear` Prop

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

## `type` Prop

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

## Custom Class Names

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

## Cancellation

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

This is implemented in
[`packages/template/src/components/Transition.ts`](../../packages/template/src/components/Transition.ts)
inside the `onMount` effect — the state machine checks `state === 'leaving'` /
`state === 'entering'` before deciding which path to take.

## SSR

On the server, `<Transition>` renders its child as **plain static HTML** — no
animation classes are emitted to the HTML string. This is safe: the animation
classes are applied on the client after hydration.

- `appear={true}` triggers once after the client-side hydration completes.
- Leave/enter toggled during SSR render simply outputs the current child state.

## Constraints

- **Single root child only.** Passing an array of children throws in `__DEV__`:
  ```
  [essor] <Transition> expects a single root child. Use <TransitionGroup> for multiple children.
  ```
- **Non-element children are skipped.** Strings, numbers, and other non-`Element`
  values will log a warning in `__DEV__` and receive no animation.
- **Reactive slot shape.** The canonical child shape is a function:
  `{() => show.value && <div/>}`. The function is re-evaluated reactively; any
  truthy `Element` result mounts, any falsy result triggers the leave.
- **`<TransitionGroup>` is not yet implemented.**

## Common Errors

### 1. Multiple children

```tsx
{/* ❌ throws in __DEV__ */}
<Transition name='fade'>
  {() => [<div key='a' />, <div key='b' />]}
</Transition>

{/* ✅ wrap in a single container */}
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
