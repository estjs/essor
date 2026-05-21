# bind — Two-way Binding

`bind` connects a form element and a piece of reactive state in both
directions:

1. When state changes, the DOM updates automatically.
2. When the user types / selects / toggles, state updates automatically.

It works on `<input>`, `<textarea>`, `<select>`, and on components that follow
the `update:*` prop convention.

## Basic Usage

```tsx
function Form() {
  const $name = ''
  const $agree = false

  return (
    <div>
      <input bind:value={$name} placeholder='Enter your name' />
      <input type='checkbox' bind:checked={$agree} />
      <p>name: {$name}</p>
      <p>agree: {$agree ? 'yes' : 'no'}</p>
    </div>
  )
}
```

## Modifiers

`bind:` accepts an optional tuple form to attach modifiers:

```tsx
<input bind:value={[$signal, { trim: true, number: true, lazy: true }]} />
```

The first array element is the bound signal; the second is a plain object with
modifier flags. JSX does not support a dotted syntax such as `bind:value.trim`
because the JSX grammar only permits a single `:` (a `JSXNamespacedName`) — the
tuple form is the canonical way to specify modifiers.

Supported modifiers:

| Modifier | Effect                                                                            |
| -------- | --------------------------------------------------------------------------------- |
| `trim`   | Strip surrounding whitespace from the committed value (strings only).            |
| `number` | Coerce numeric strings to numbers. Blank/whitespace and `NaN` keep the string.   |
| `lazy`   | Commit on `change` instead of `input` — typically commits on blur.               |

```tsx
function Demo() {
  let $keyword = ''
  let $age: number | string = ''
  let $slug = ''

  return (
    <>
      <input bind:value={[$keyword, { trim: true }]} placeholder='auto-trims' />
      <input bind:value={[$age, { number: true }]}    placeholder='numeric coercion' />
      <input bind:value={[$slug, { trim: true, lazy: true }]} placeholder='commits on blur' />
    </>
  )
}
```

Unknown modifier keys (typos) fail at **compile time** so `{ trimm: true }`
gives you a clear error instead of silently doing nothing.

### Automatic numeric coercion

`<input type="number">` and `<input type="range">` always emit numbers to the
model, even without an explicit `{ number: true }` — this matches Vue's
`v-model.number` auto-behaviour:

```tsx
let $progress = 0
<input type='range' min='0' max='100' bind:value={$progress} />
// $progress is number, not string
```

## Input Type Examples

### Text Input

```tsx
let $title = ''
<input bind:value={$title} />
```

### Checkbox (boolean)

```tsx
let $enabled = false
<input type='checkbox' bind:checked={$enabled} />
```

### Checkbox group (array)

When the bound model is an array, each checkbox toggles its own `value` in/out
of the array. The compiler does not look at the model type — the runtime
decides per-event based on whether the current model is an array:

```tsx
const $skills: string[] = []
<>
  <input type='checkbox' value='ts'    bind:checked={$skills} /> TypeScript
  <input type='checkbox' value='react' bind:checked={$skills} /> React
  <input type='checkbox' value='essor' bind:checked={$skills} /> Essor
</>
```

### Radio

```tsx
let $theme = 'light'

<>
  <input type='radio' name='theme' value='light' bind:checked={$theme} />
  <input type='radio' name='theme' value='dark'  bind:checked={$theme} />
</>
```

### Select

```tsx
const $city = 'beijing'
<select bind:value={$city}>
  <option value='beijing'>Beijing</option>
  <option value='shanghai'>Shanghai</option>
</select>
```

### Select Multiple

```tsx
const $skills = ['ts']
<select multiple bind:value={$skills}>
  <option value='ts'>TypeScript</option>
  <option value='react'>React</option>
  <option value='essor'>Essor</option>
</select>
```

### Textarea

```tsx
const $bio = ''
<textarea bind:value={$bio} />
```

### File Input

```tsx
let $files: FileList | null = null
<input type='file' bind:files={$files} />
```

Browsers forbid programmatic writes to `<input type=file>`, so the binding is
effectively one-way (DOM → model). Setting the model to `null` does attempt to
clear the selection via a `DataTransfer` FileList where supported.

## bind on Components

On a component, `bind:value={$x}` desugars to **two regular props** — `value`
and `'update:value'`:

```tsx
<MyInput bind:value={$name} />
// compiles to:
<MyInput value={$name} update:value={(v) => $name = v} />
```

The component reads them straight off `props`:

```tsx
function MyInput(props: {
  value?: string
  'update:value'?: (value: string) => void
}) {
  return (
    <input
      value={props.value}
      onInput={(e) => props['update:value']?.((e.currentTarget as HTMLInputElement).value)}
    />
  )
}

function App() {
  const $name = ''
  return <MyInput bind:value={$name} />
}
```

The bound key controls both prop names — `bind:checked` becomes
`checked={...}` + `'update:checked'={...}`, and so on.

Modifier objects on the **call site** are not forwarded — modifier semantics
belong on the leaf DOM element. If you need DOM-level behavior, apply it inside
the component before calling the setter:

```tsx
function MyInput(props: {
  value?: string
  'update:value'?: (value: string) => void
}) {
  return (
    <input
      value={props.value}
      onInput={(e) =>
        props['update:value']?.((e.currentTarget as HTMLInputElement).value.trim())
      }
    />
  )
}
```

## Behavior Notes

`bind:` is implemented by [`bindElement`](../../packages/template/src/binding.ts)
and behaves like Vue's `v-model`:

1. **IME composition** — while the user is composing CJK input via an IME, the
   model is not updated until `compositionend` fires (no half-committed
   characters). External model writes are also held back during composition so
   they don't clobber the pending input.
2. **Lazy + IME** — even in `{ lazy: true }` mode, external model writes are
   suspended during IME composition; only the DOM→model commit timing changes
   to `change`.
3. **Cursor preservation** — when the bound text input is focused and its
   on-screen value already matches the model (after applying `trim` /
   `number`), the framework skips the DOM write. This prevents the caret from
   jumping while the user is typing.
4. **Trim/number normalisation** — the displayed value is normalised on
   `change` (typically blur) when these modifiers are active so the input
   shows the canonical form even if the user typed extra whitespace.
5. **Blank-input number safety** — `{ number: true }` returns the original
   string for blank / whitespace-only input instead of silently producing `0`
   (which is what `Number(' ')` would do).
6. **Lifecycle** — the reactive effect that drives DOM updates is registered
   with the active scope, so unmounting the component automatically stops it.

## Common Errors

### 1. Non-writable bind target

Invalid:

```tsx
const $name = 'a'
<input bind:value={$name + 'x'} />
```

`$name + 'x'` is an expression, not a writable target — the compiler cannot
emit a setter.

Valid:

```tsx
let $name = 'a'
<input bind:value={$name} />
```

### 2. Unknown modifier

```tsx
<input bind:value={[$x, { trimm: true }]} />
// Throws at build time:
// [essor] Unknown bind:value modifier "trimm". Allowed: trim, number, lazy.
```

### 3. Dotted modifier syntax does not work

```tsx
// ❌ Parse error — JSX does not allow `.` in attribute names.
<input bind:value.trim={$x} />

// ✅ Use the tuple form instead.
<input bind:value={[$x, { trim: true }]} />
```

## Best Practices

1. Use `bind:value` for text-like controls; `bind:checked` for boolean / radio
   controls; `bind:files` for file inputs.
2. Reach for `{ trim: true }` whenever you persist user-entered text — almost
   always what you want.
3. Prefer `<input type="number">` over `{ number: true }` for numeric fields
   — the auto-coercion kicks in for free and gives the user a numeric keypad
   on mobile.
4. Use `{ lazy: true }` for slug / search fields where every keystroke does
   not need to round-trip through state.
5. Bind variables or object fields, not computed expressions.
6. For large forms, keep the bound fields inside one reactive object so you
   can serialise / reset / validate them as a unit.
