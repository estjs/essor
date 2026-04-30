# bind Two-way Binding

`bind` connects form elements and state in both directions:

1. When state changes, DOM updates automatically
2. When users type/select, state updates automatically

It works with `input`, `textarea`, `select`, and components that follow the binding convention.

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

## Shorthand Syntax

`bind` supports shorthand. The framework infers the target prop by element type:

```tsx
function Demo() {
  const $text = ''
  const $checked = false

  return (
    <>
      <input bind={$text} />
      <input type='checkbox' bind={$checked} />
    </>
  )
}
```

Inference rules:

1. `input[type=checkbox|radio]` -> `checked`
2. `input[type=file]` -> `files`
3. Other `input/textarea/select` -> `value`

## Modifiers

Supported modifiers: `trim`, `number`, `lazy`.

```tsx
function Demo() {
  let $keyword = ''
  let $age: string | number = ''

  return (
    <>
      <input bind:value.trim={$keyword} placeholder='trim spaces automatically' />
      <input bind:value.number={$age} placeholder='try converting to number' />
      <input bind:value.lazy={$keyword} placeholder='commit on change event' />
    </>
  )
}
```

Notes:

1. `trim`: applies only to strings
2. `number`: converts to number when possible, keeps original value on `NaN`
3. `lazy`: commits on `change` instead of `input`

## Input Type Examples

### Text Input

```tsx
let $title = ''
<input bind:value={$title} />
```

### Checkbox

```tsx
let $enabled = false
<input type='checkbox' bind:checked={$enabled} />
```

### Radio

```tsx
let $theme = 'light'

<>
  <input type='radio' name='theme' value='light' bind:checked={$theme} />
  <input type='radio' name='theme' value='dark' bind:checked={$theme} />
</>
```

### Select

```tsx
const $city = 'beijing';

<select bind:value={$city}>
  <option value='beijing'>Beijing</option>
  <option value='shanghai'>Shanghai</option>
</select>
```

### Select Multiple

```tsx
const $skills = ['ts'];

<select multiple bind:value={$skills}>
  <option value='ts'>TypeScript</option>
  <option value='react'>React</option>
  <option value='essor'>Essor</option>
</select>
```

### Textarea

```tsx
const $bio = '';
<textarea bind:value={$bio} />
```

### File Input

```tsx
const $files: FileList | null = null;
<input type='file' bind:files={$files} />
```

Note: due to browser security constraints, file input is generally one-way from user selection to state.

## bind on Components

On components, `bind:value={$x}` compiles to:

1. `value={x}`
2. `onValueChange={(v) => x = v}`

Example:

```tsx
function MyInput(props) {
  return (
    <input
      value={props.value}
      onInput={e => props.onValueChange?.((e.target as HTMLInputElement).value)}
    />
  )
}

function App() {
  const $name = ''
  return <MyInput bind:value={$name} />
}
```

## Behavior Notes

`bind:` is implemented by `bindElement` and behaves like Vue's `v-model`:

1. **IME composition**: while the user is composing (e.g. Chinese / Japanese
   IME) the model is not updated until `compositionend` fires. This avoids
   committing half-formed characters to the signal.
2. **Cursor preservation**: when the bound text input is focused and its
   on-screen value already matches the model (after applying `trim` /
   `number`), the framework skips the DOM write. This prevents the caret
   from jumping while the user is typing.
3. **Trim/number normalization**: the displayed value is also normalized on
   `change` (blur) so the input shows the canonical form even if the user
   typed extra whitespace.
4. **Disposal**: the reactive effect that drives DOM updates is registered
   with the active scope, so unmounting the component automatically stops
   it.

## Common Errors

### 1. Non-writable bind target

Invalid:

```tsx
const $name = 'a'
<input bind:value={$name + 'x'} />
```

Reason: `$name + 'x'` is an expression, not a writable target.

Valid:

```tsx
let $name = 'a'
<input bind:value={$name} />
```

### 2. Unsupported modifier

Only `trim`, `number`, and `lazy` are supported.  
Other modifiers fail at compile time.

## Best Practices

1. Use `bind:value` for text-like controls
2. Use `bind:checked` for boolean controls
3. Add `.number` only when conversion is needed
4. Avoid binding complex expressions directly; bind variables or object fields
5. For large forms, keep fields inside one reactive object
