# Essor Forms & Two-Way Binding

## bind:value — Text Inputs

```tsx
let $email = '';
let $age = 0;
let $search = '';

<input bind:value={$email} />          // plain string
<input bind:value.trim={$name} />      // trim whitespace
<input bind:value.number={$age} />     // coerce to number (NaN-safe)
<input bind:value.lazy={$search} />    // commit on change, not input
```

| Modifier | Behavior | Use Case |
|---|---|---|
| `trim` | Strip whitespace | Name, email |
| `number` | `Number(v)`, no-op on NaN | Age, price |
| `lazy` | Commit on `change` | Search, heavy validation |

Modifiers combine: `bind:value.trim.number={$price}`.

## bind:checked — Checkbox & Radio

```tsx
let $agree = false;
<input type="checkbox" bind:checked={$agree} />

let $color = 'red';
<input type="radio" value="red" bind:checked={$color} />
<input type="radio" value="blue" bind:checked={$color} />
// $color updates to selected radio's value
```

## bind:files

```tsx
let $files: FileList | null = null;
<input type="file" bind:files={$files} />
// Note: Model→DOM is no-op for file inputs (browser restriction)
```

## select

```tsx
let $opt = 'b';
<select bind:value={$opt}>
  <option value="a">A</option>
  <option value="b">B</option>
</select>

// Multiple select — $ array declarations become reactive arrays:
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
      <input type="email" bind:value={$email} required />
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

<input bind:value={$email} onBlur={() => ($touched = true)} class={errors().email ? 'err' : ''} />
{errors().email && <span class="error">{errors().email}</span>}
```

## Binding Gotchas

- `bind:value` only works on `<input>`, `<textarea>`, `<select>` — not divs
- `bind:checked` only on checkbox/radio — text inputs must use `bind:value`
- `bind:value.lazy` may capture mid-IME for CJK — prefer default for IME languages
