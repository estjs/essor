# Essor SSR / Hydration

## The Hydration Contract

**Server and client MUST produce identical initial HTML.** Hydration walks existing DOM via `data-hk` attributes and attaches reactive bindings — it does not re-render.

## Rendering Decision

```
HTML comes from?
├── Browser-only → createApp()
└── Server/build → hydrate()

Server HTML via?
├── Sync data     → renderToString()
├── Async data    → renderToStringAsync()
└── Streaming     → renderToStream()

SSG vs SSR: same entry-server.tsx, different call timing (build vs request).
```

## Minimum Setup

```
src/
  App.tsx              # Shared — single source of truth
  entry-client.tsx     # hydrate(App, '#app')
  entry-server.tsx     # export render() { return renderToString(App) }
```

```tsx
// entry-client.tsx
import { hydrate } from 'essor';
import { App } from './App';
hydrate(App, '#app');     // ✅ attaches to existing DOM

// ❌ createApp(App, '#app') — would clear SSR HTML

// entry-server.tsx
import { renderToString } from '@estjs/server';
export function render() { return renderToString(App, {}); }
```

## SSR Context (Portal support)

```tsx
import { createSSRContext, renderToString } from '@estjs/server';

const ctx = createSSRContext();
const html = renderToString(App, {}, ctx);
// ctx.teleports['#modal-root'] contains Portal content
```

## Hydration Safety

**❌ NEVER in shared App.tsx:**

| Unsafe | Fix |
|---|---|
| `window.innerWidth` | `onMount(() => { $w = window.innerWidth })` |
| `document.querySelector()` | `onMount(() => { ... })` |
| `Date.now()` | Pass as prop from server entry |
| `Math.random()` | Pass as prop or `onMount` |
| `localStorage` | `onMount` |
| Conditional render on `window` | Render both, toggle in `onMount` |

```tsx
// ✅ Safe pattern:
function App() {
  let $ready = false;
  onMount(() => { $ready = true; });
  return <div>{$ready ? <ClientWidget /> : <Placeholder />}</div>;
}
```

## SSG Build Script

```tsx
import { renderToString, createSSRContext } from '@estjs/server';
import { writeFileSync } from 'fs';
import { App } from '../src/App';

const ctx = createSSRContext();
const html = renderToString(App, { buildTime: Date.now() }, ctx);
const fullHtml = `<!DOCTYPE html>
<html><body>
  <div id="app">${html}</div>
  ${Object.entries(ctx.teleports).map(([sel, c]) => `<div id="${sel.slice(1)}">${c}</div>`).join('')}
  <script type="module" src="/src/entry-client.tsx"></script>
</body></html>`;
writeFileSync('dist/index.html', fullHtml);
```

## Common Errors

1. **`createApp` on SSR page** — clears server HTML. Use `hydrate()`.
2. **Different root components** — `hydrate(App)` vs `renderToString(Other)`. Use same component.
3. **Mismatched container** — server renders `#app`, client targets `#root`.
4. **Browser API in shared component** — `window.innerWidth` crashes on server.
5. **`Date.now()` / `Math.random()`** — different on server vs client, causes mismatch.
