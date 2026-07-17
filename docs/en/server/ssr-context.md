# SSR Context & Request Isolation

`SSRContext` collects out-of-tree render output (e.g. Portal teleports) and user metadata for a single render. Combined with request-local state isolation, it makes concurrent SSR safe.

## createSSRContext / getSSRContext

```typescript
import { createSSRContext, getSSRContext, renderToString } from '@estjs/server';

const ctx = createSSRContext();
const html = renderToString(App, {}, ctx);

// Portal content rendered during this pass is collected per target:
ctx.teleports; // { '#modal-root': '<div>modal content</div>', ... }
```

`getSSRContext()` returns the context of the **current render** from anywhere inside the component tree (including after `await` in async components), or `null` outside a render / when no context was passed:

```typescript
import { getSSRContext } from '@estjs/server';

function Head() {
  const ctx = getSSRContext();
  if (ctx) {
    // Free-form bag: collect anything the server shell needs
    ctx.title = 'My Page';
  }
  return null;
}
```

### SSRContext shape

```typescript
interface SSRContext {
  /** Portal target selector → concatenated HTML. The caller inlines each
      entry into the final document (e.g. replacing a shell placeholder). */
  teleports: Record<string, string>;
  /** Free-form key/value bag for per-render metadata
      (collected <head> tags, status codes, response headers, ...). */
  [key: string]: unknown;
}
```

## Teleports

`<Portal>` content cannot be emitted inline — it belongs elsewhere in the document. During SSR each portal appends its HTML to `context.teleports[target]`; your server integrates it:

```typescript
const ctx = createSSRContext();
const appHtml = renderToString(App, {}, ctx);

const page = shellTemplate
  .replace('<!--app-->', appHtml)
  .replace('<!--modals-->', ctx.teleports['#modal-root'] ?? '');
```

## Request isolation (concurrency)

SSR state — the active `provide()`/`inject()` scope, the hydration key counter, and the SSR context itself — is **request-local**. On Node, Essor carries it across `await` boundaries with `AsyncLocalStorage`, so concurrent `renderToStringAsync` calls never observe each other's state:

```typescript
// Two interleaved requests: each sees only its own provide() values
// and its own hydration key sequence.
const [a, b] = await Promise.all([
  renderToStringAsync(PageA, {}, createSSRContext()),
  renderToStringAsync(PageB, {}, createSSRContext()),
]);
```

Key guarantees (covered by the concurrency test suite):

- `provide()` in request A is never visible to `inject()` in request B
- Hydration keys (`data-hk`) start at 0 for every render — no leakage between sequential or concurrent renders
- The request scope stays alive for lazy thunks executed during serialization (compiled children resolve after the component function returns)
- `SSRContext` metadata written mid-render stays with its own render

> On platforms without `AsyncLocalStorage` the context degrades to a synchronous-only fallback — `renderToString` (sync) remains fully isolated; concurrent *async* renders are not supported there.

## See also

- [SSR basics](/en/server/ssr)
- [Async SSR](/en/server/streaming)
- [Security & Escaping](/en/server/security)
