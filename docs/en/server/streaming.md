# Async SSR (renderToStringAsync)

> **Streaming is not implemented yet.** Essor currently renders the full page and returns a single string. True streaming (`renderToStream` with out-of-order Suspense flushing) is on the roadmap — see the [Roadmap section](#roadmap-true-streaming) at the bottom. This page documents the **async rendering** that exists today.

## Sync vs async rendering

`renderToString` is strictly synchronous. If a component returns a Promise, it **throws** — awaiting is impossible on the sync path, and silently serializing a Promise would ship broken HTML:

```typescript
import { renderToString } from '@estjs/server';

const AsyncPage = async () => { /* ... */ };

renderToString(AsyncPage, {});
// Error: renderToString received a Promise - use renderToStringAsync for async components.
```

`renderToStringAsync` is the Promise-aware variant:

```typescript
function renderToStringAsync<P>(
  component: ComponentFn<P>,
  props?: P,
  context?: SSRContext | null
): Promise<string>
```

## Basic usage

```typescript
import { renderToStringAsync } from '@estjs/server';

async function App({ userId }) {
  const user = await fetchUser(userId);
  return (
    <main>
      <h1>Welcome, {user.name}</h1>
    </main>
  );
}

// Server handler
const html = await renderToStringAsync(App, { userId: '123' });
res.setHeader('Content-Type', 'text/html');
res.end(html);
```

The entire tree is awaited before anything is sent: **TTFB equals the slowest data dependency**. This is the trade-off versus streaming — in exchange, the HTTP status code stays fully controllable (see [Concurrency & errors](#concurrency--errors)).

## What gets awaited

The awaited component result flows through a Promise-aware resolution pipeline that transparently unwraps, recursively:

- `async` component functions (the component itself returns a Promise)
- Promises nested in array results (e.g. `{items.map(async item => ...)}`)
- Promise-returning thunks (compiled lazy children)

```typescript
async function Sections() {
  return [
    renderHeader(),            // sync value
    fetchBody(),               // Promise<JSX>
    async () => fetchFooter(), // promise-returning thunk
  ];
}
```

## provide / inject across await

The request's reactive scope stays alive across `await` boundaries (via `AsyncLocalStorage` on Node), so dependency injection works naturally in async components — including `provide()` calls made **after** an `await`:

```typescript
import { provide, inject } from 'essor';

const PageDataKey = Symbol('page-data');

async function Parent() {
  const data = await loadPageData();
  provide(PageDataKey, data); // after await — still request-scoped
  return <Child />;
}

function Child() {
  const data = inject(PageDataKey);
  return <p>{data.title}</p>;
}
```

Concurrent renders never observe each other's scope — see [SSR Context & Request Isolation](/en/server/ssr-context).

## Suspense semantics in SSR

On the server, `<Suspense>` is synchronous at serialization time: if `children` resolved to content, it renders the children; the `fallback` only appears when children are nil. With `renderToStringAsync`, data resolves **before** serialization, so the shipped HTML contains the final content — not the fallback:

```tsx
async function Page() {
  const todos = await fetchTodos();
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <TodoList items={todos} />
    </Suspense>
  );
}
// Shipped HTML: the todo list. The fallback never appears on the server.
```

After hydration on the client, `Suspense` takes over any *subsequent* async work as usual.

## Concurrency & errors

- Each `renderToStringAsync` call runs in an isolated request scope: `provide()`/`inject()` state, hydration keys, and the `SSRContext` never leak between concurrent renders.
- A rejecting component **rejects the whole render Promise**, and the render scope is disposed. Because nothing was sent yet, your server keeps full control of the HTTP status:

```typescript
try {
  const html = await renderToStringAsync(App, props);
  res.writeHead(200, { 'Content-Type': 'text/html' }).end(html);
} catch (err) {
  res.writeHead(500).end('Internal Server Error');
}
```

This is a genuine advantage over streaming: once a stream has started with a `200`, an error mid-stream cannot change the status code.

## Roadmap: true streaming

A `renderToStream` API — flushing the shell immediately and streaming Suspense boundary content out of order as it resolves — is planned but **not implemented**. Do not reference `renderToStream` in production code; it does not exist in any released version. Until it lands, `renderToStringAsync` is the supported way to render async component trees on the server.
