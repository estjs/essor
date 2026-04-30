# AGENTS.md - Essor Framework Development Guide

**Essor** is a signal-based reactive frontend framework with no virtual DOM, built on fine-grained reactivity.

**Version**: 0.0.15-beta.14 | **License**: MIT | **Package Manager**: pnpm@10.28.0

---

## Quick Commands

```bash
pnpm dev              # Watch mode
pnpm build            # Build all packages
pnpm typecheck        # TypeScript strict check
pnpm lint             # ESLint auto-fix
pnpm test             # Unit tests (vitest)
pnpm test:e2e         # E2E (playwright)
pnpm coverage         # Coverage report

# Run a single test file
cd packages/signals && pnpm vitest run signal.spec.ts
```

---

## Architecture

```
essor-monorepo/
├── packages/
│   ├── core/          # essor — conditional exports: browser → signals+template, node → server
│   ├── signals/       # @estjs/signals — signal, computed, effect, reactive, watch, store
│   ├── template/      # @estjs/template — rendering, hydration, lifecycle, Suspense, Portal
│   ├── server/        # @estjs/server — SSR/SSG renderToString
│   ├── shared/        # @estjs/shared — common utilities
│   ├── babel-plugin/  # babel-plugin-essor — JSX transform + $ prefix
│   └── unplugin/      # unplugin-essor — build integration + HMR runtime
├── examples/          # basic, todo, fragment, portal, provide, suspense, hmr
└── e2e/               # Playwright tests
```

**Dependency Graph**:
```
essor (browser) → signals + template
essor (node)    → server
signals  → shared
template → signals + shared
server   → template + shared
babel-plugin → shared
unplugin → babel-plugin
```

---

## Core Concepts

### 1. `$` Prefix — Auto Signal Transform (Critical!)

Variables prefixed with `$` are **automatically transformed** by the Babel plugin:

```tsx
const $count = 0;        // → signal(0)
const $name = 'John';    // → signal('John')
const $list: string[] = []; // → reactive([])

// In JSX:
<div>{$count}</div>           // → () => $count.value
<button onClick={() => $count++}>  // → $count.value++
<input bind:value={$name} />  // → two-way binding
```

Rules:
- Variables **without** `$` are NOT reactive
- Primitives → `signal()`, Arrays/Objects → `reactive()`
- Works for `const`, `let`, `var`

### 2. Reactivity Primitives

```typescript
signal(value)            // primitive reactive value
reactive(obj)            // deep reactive proxy for objects/arrays
computed(getter)         // lazy derived value, cached until deps change
effect(fn)               // auto-tracks deps, re-runs on change
watch(source, callback)  // explicit watcher with old/new values
batch(fn)                // defer updates, flush once at end
nextTick(fn?)            // run after current flush cycle
untrack(fn)              // read signals without tracking
```

### 3. Store Pattern

```tsx
const useStore = createStore({
  state: { todos: [] },
  getters: { active: s => s.todos.filter(t => !t.done) },
  actions: {
    add(text) { this.todos.push({ text, done: false }); }
  }
});
```

### 4. SSR / Hydration

```tsx
// server.ts
import { renderToString } from '@estjs/server';
const html = renderToString(App, props);

// client.ts
import { createApp } from 'essor';
createApp(App, '#root'); // auto-detects SSR HTML and hydrates
```

### 5. Async Components

```tsx
function UserProfile({ id }) {
  const [user] = createResource(() => fetch(`/api/users/${id}`).then(r => r.json()));
  return <div>{user()?.name}</div>;
}

<Suspense fallback={<Loading />}>
  <UserProfile id={1} />
</Suspense>
```

---

## Code Style

- 2-space indent, LF, no semicolons
- TypeScript strict mode required
- kebab-case files, camelCase functions, PascalCase types
- Bitwise ops for flags: `flag |= DIRTY`, `flag &= ~DIRTY`

---

## Common Gotchas

1. `const count = 0` is NOT reactive — must use `$count`
2. Use `$list.push()`, not `$list = [...$list, item]`
3. Server/client HTML must match exactly for hydration
4. Return cleanup functions from `effect()` / `onMount()`
5. HMR: function body changes trigger component updates

---

## Troubleshooting

```bash
# Build issues
rm -rf packages/*/dist && pnpm build

# Verbose test output
pnpm vitest --reporter=verbose

# HMR not working → check babel config, unplugin loaded, console errors
# Hydration mismatch → check server/client HTML match, hydration keys
```

---

## Resources

- **GitHub**: https://github.com/estjs/essor
- **Docs**: https://essor.netlify.app/
- **NPM**: https://www.npmjs.com/package/essor

