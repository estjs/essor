# Essor App Templates

Fixed scaffolds. Every template follows the same shape:

```
imports → props/types → reactive state → derived → lifecycle → handlers → return
```

Copy the matching template, fill the slots, and only deviate when the task forces it. Structural consistency is the point — if every Essor app starts the same way, agents stop drifting on import lists, mount calls, and entry-file layout.

---

## T1 — Client-Only Entry

```tsx
// src/entry.tsx
import { createApp } from 'essor';
import { App } from './App';

createApp(App, '#app');
```

```tsx
// src/App.tsx
import { onMount } from 'essor';

export function App() {
  let $count = 0;

  const onClick = () => $count++;

  return (
    <main>
      <h1>Count: {$count}</h1>
      <button onClick={onClick}>+1</button>
    </main>
  );
}
```

`index.html` must have `<div id="app"></div>` empty — `createApp` clears it.

---

## T2 — SSR / SSG Three-File Set

Three files, identical `App` import on both sides.

```tsx
// src/App.tsx — shared. No browser globals.
export function App(props: { initial: number }) {
  let $count = props.initial;
  return <button onClick={() => $count++}>{$count}</button>;
}
```

```tsx
// src/entry-server.tsx
import { renderToString } from '@estjs/server';
import { App } from './App';

export function render(initial = 0) {
  return renderToString(App, { initial });
}
```

```tsx
// src/entry-client.tsx
import { hydrate } from 'essor';
import { App } from './App';

const initial = Number(document.documentElement.dataset.initial ?? 0);
hydrate(App, '#app', { initial });
```

Use `renderToStringAsync` instead of `renderToString` if `App` reads async data during render.

---

## T3 — SSG Build Script (with Portal)

```tsx
// scripts/build.ts
import { writeFileSync } from 'node:fs';
import { createSSRContext, renderToString } from '@estjs/server';
import { App } from '../src/App';

const ctx = createSSRContext();
const html = renderToString(App, { buildTime: Date.now() }, ctx);

const teleports = Object.entries(ctx.teleports)
  .map(([sel, content]) => `<div id="${sel.slice(1)}">${content}</div>`)
  .join('');

writeFileSync(
  'dist/index.html',
  `<!DOCTYPE html>
<html><body>
  <div id="app">${html}</div>
  ${teleports}
  <script type="module" src="/src/entry-client.tsx"></script>
</body></html>`,
);
```

`buildTime` is passed as a prop so server and client agree — never call `Date.now()` inside `App`.

---

## T4 — Validated Form

```tsx
import { onMount } from 'essor';

export function SignupForm() {
  const $email = '';
  const $password = '';
  const $agree = false;
  let $touched = false;
  let $submitting = false;
  let $serverError = '';

  const errors = () => {
    if (!$touched) return {} as Record<string, string>;
    const e: Record<string, string> = {};
    if (!$email.trim()) e.email = 'Required';
    else if (!$email.includes('@')) e.email = 'Invalid email';
    if ($password.length < 8) e.password = 'Min 8 chars';
    return e;
  };

  const canSubmit = () =>
    $agree && Object.keys(errors()).length === 0 && !$submitting;

  const submit = async (e: Event) => {
    e.preventDefault();
    $touched = true;
    if (!canSubmit()) return;
    $submitting = true;
    $serverError = '';
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: $email, password: $password }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
    } catch (error) {
      $serverError = (error as Error).message;
    } finally {
      $submitting = false;
    }
  };

  return (
    <form onSubmit={submit} onBlur={() => ($touched = true)}>
      <input type="email" bind:value={[$email, { trim: true }]} required />
      {errors().email && <span class="err">{errors().email}</span>}

      <input type="password" bind:value={$password} required />
      {errors().password && <span class="err">{errors().password}</span>}

      <label><input type="checkbox" bind:checked={$agree} /> I agree</label>

      {$serverError && <div class="err">{$serverError}</div>}

      <button type="submit" disabled={() => !canSubmit()}>
        {$submitting ? 'Submitting...' : 'Sign up'}
      </button>
    </form>
  );
}
```

---

## T5 — Async Data with Suspense

```tsx
import { Suspense, createResource, watch } from 'essor';

export function UserCard(props: { $userId: () => string }) {
  const [user, { refetch }] = createResource(
    () => fetch(`/api/users/${props.$userId()}`).then((r) => r.json()),
    { initialValue: null },
  );

  watch(props.$userId, () => refetch());

  return (
    <Suspense fallback={<p>Loading…</p>}>
      {user.error.value && <p class="err">{user.error.value.message}</p>}
      {user() && <h2>{user().name}</h2>}
    </Suspense>
  );
}
```

Read status through `user.loading.value` / `user.error.value` / `user.state.value`. The accessor `user()` returns the current value or `undefined`.

---

## T6 — Keyed List with `<For>`

```tsx
import { For } from 'essor';

interface Todo { id: string; title: string; done: boolean }

export function TodoList() {
  const $todos: Todo[] = [];

  const add = (title: string) =>
    $todos.push({ id: crypto.randomUUID(), title, done: false });

  const toggle = (id: string) => {
    const t = $todos.find((x) => x.id === id);
    if (t) t.done = !t.done;
  };

  return (
    <ul>
      <For each={$todos} key={(t) => t.id} fallback={() => <li>Empty</li>}>
        {(t) => (
          <li>
            <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} />
            {t.title}
          </li>
        )}
      </For>
    </ul>
  );
}
```

Skip `key` only when items only append/remove from the end.

---

## T7 — Shared Store

```tsx
// src/stores/counter.ts
import { createStore } from 'essor';

export const useCounter = createStore({
  state: { count: 0, history: [] as number[] },
  getters: {
    double: (s) => s.count * 2,
    last:   (s) => s.history[s.history.length - 1] ?? null,
  },
  actions: {
    increment() { this.history.push(this.count); this.count++; },
    reset()     { this.count = 0; this.history = []; },
  },
});
```

```tsx
// consumer
import { useCounter } from './stores/counter';

export function Counter() {
  const store = useCounter();
  return (
    <>
      <p>{store.count} (×2 = {store.double})</p>
      <button onClick={() => store.increment()}>+1</button>
      <button onClick={() => store.reset()}>reset</button>
    </>
  );
}
```

Use a store only when state is shared across features or needs named actions/getters. For component-local state, stick with `let $x = …`.

---

## Slot-Filling Rules

- Keep the section order above. Re-ordering hides where state lives.
- Names are placeholders — rename to fit the domain, but do not collapse `state → derived → handlers` into one block.
- If a template forces a hack (e.g. you need streaming SSR), stop and revisit Phase 1 of `SKILL.md` instead of mutating the scaffold.
