# Essor

## Commands

```bash
pnpm build            # dist/ must exist before tests run
pnpm test             # vitest
pnpm test:e2e         # playwright
```

## Architecture

```
packages/
├── core/          # essor — browser: signals+template, node: server
├── signals/       # @estjs/signals
├── template/      # @estjs/template
├── server/        # @estjs/server — SSR/SSG
├── babel-plugin/  # JSX transform + $ prefix
└── unplugin/      # build integration + HMR
```

## `$` Prefix — Auto Signal Transform

Variables with `$` prefix are transformed by Babel:

```tsx
const $count = 0;        // → signal(0)
const $list: T[] = [];   // → reactive([])

<div>{$count}</div>                    // → () => $count.value
<button onClick={() => $count++}>     // → $count.value++
```

**Rules:**
- `const count = 0` is NOT reactive — must use `$count`
- Primitives → `signal()`, Arrays/Objects → `reactive()`
- Use `$list.push()`, not `$list = [...$list, item]`

## SSR / Hydration

Server/client HTML must match exactly. `createApp()` auto-detects SSR markup and hydrates.

## Gotchas

- Return cleanup from `effect()` / `onMount()`
- HMR triggers on function body changes



