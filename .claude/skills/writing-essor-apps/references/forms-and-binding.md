# Essor Forms & Two-Way Binding

## bind:value — Text Inputs

```tsx
let $email = '';
let $name = '';
let $age: number | string = '';
let $search = '';

<input bind:value={$email} />                                  // plain string
<input bind:value={[$name, { trim: true }]} />                 // trim whitespace
<input bind:value={[$age, { number: true }]} />                // numeric coercion
<input bind:value={[$search, { lazy: true, trim: true }]} />   // commit on change
```

**JSX does not support `bind:value.trim` (no dotted attribute names).** Use the
tuple form: `bind:value={[$signal, { ...modifiers }]}`. Unknown modifier keys
throw at compile time.

| Modifier | Behavior | Use Case |
|---|---|---|
| `trim` | Strip surrounding whitespace | Name, email, slug |
| `number` | Coerce to number; **blank/whitespace/NaN return the original string** | Age, price |
| `lazy` | Commit on `change` (typically blur) instead of `input` | Search, slug, heavy validation |

`<input type="number">` and `<input type="range">` are auto-coerced to numbers
even without `{ number: true }` (Vue parity).

## bind:checked — Checkbox & Radio

```tsx
let $agree = false;
<input type="checkbox" bind:checked={$agree} />

// Checkbox group: when the model is an array, each box toggles its own `value` in/out
const $skills: string[] = [];
<input type="checkbox" value="ts"    bind:checked={$skills} />
<input type="checkbox" value="react" bind:checked={$skills} />

let $color = 'red';
<input type="radio" value="red"  bind:checked={$color} />
<input type="radio" value="blue" bind:checked={$color} />
```

## bind:files

```tsx
let $files: FileList | null = null;
<input type="file" bind:files={$files} />
// DOM→Model only (browser restriction); setting model to null clears via DataTransfer.
```

## select

```tsx
let $opt = 'b';
<select bind:value={$opt}>
  <option value="a">A</option>
  <option value="b">B</option>
</select>

let $sel: string[] = [];
<select multiple bind:value={$sel}>...</select>
```

## Form Submission

```tsx
function SignupForm() {
  let $email = '';
  let $password = '';
  let $agree = false;
  let $submitting = false;
  let $error = '';

  const submit = async (e: Event) => {
    e.preventDefault();
    $submitting = true;
    $error = '';
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: $email, password: $password }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
    } catch (err) {
      $error = (err as Error).message;
    } finally {
      $submitting = false;
    }
  };

  return (
    <form onSubmit={submit}>
      <input type="email"    bind:value={[$email, { trim: true }]} required />
      <input type="password" bind:value={$password} required />
      <label><input type="checkbox" bind:checked={$agree} /> I agree</label>
      {$error && <div class="error">{$error}</div>}
      <button type="submit" disabled={() => $submitting || !$agree}>
        {$submitting ? 'Submitting...' : 'Sign Up'}
      </button>
    </form>
  );
}
```

## Validation Pattern

```tsx
let $email = '';
let $touched = false;

const errors = () => {
  if (!$touched) return {};
  const e: Record<string, string> = {};
  if (!$email.trim()) e.email = 'Required';
  else if (!$email.includes('@')) e.email = 'Invalid email';
  return e;
};

<input bind:value={[$email, { trim: true }]}
       onBlur={() => ($touched = true)}
       class={errors().email ? 'err' : ''} />
{errors().email && <span class="error">{errors().email}</span>}
```

## bind on Components

`<MyInput bind:value={$name} />` desugars to two normal props:
`value={$name}` + `'update:value'={(v) => $name = v}`. The component declares
both keys in its props type and reads them directly.

```tsx
function MyInput(props: {
  value?: string;
  'update:value'?: (value: string) => void;
}) {
  return (
    <input
      value={props.value}
      onInput={(e) =>
        props['update:value']?.((e.currentTarget as HTMLInputElement).value)
      }
    />
  );
}

function App() {
  const $name = '';
  return <MyInput bind:value={$name} />;
}
```

The bound key drives both prop names — `bind:checked` becomes
`checked={...} + 'update:checked'={...}`, and so on.

Modifiers attached at the **call site** are dropped at the component boundary —
attach them on the leaf DOM element inside the component instead.

## Binding Gotchas

- `bind:value` only works on `<input>` (type=text/email/.../number/range),
  `<textarea>`, `<select>` — not on divs.
- `bind:checked` only on checkbox/radio — text inputs must use `bind:value`.
- IME composition (CJK) is guarded automatically in **both** eager and lazy
  modes — external model writes are held during composition.
- `{ number: true }` does NOT silently produce `0` on blank input (it keeps the
  string); the only thing that turns blank into a number is `<input type="number">`.
- Bind variables / object fields, not computed expressions
  (`bind:value={$name + 'x'}` is a compile-time error).
