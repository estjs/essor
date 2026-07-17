# Async SSR (`renderToStringAsync`)

Minimal example of Essor's async server-side rendering: the server awaits a slow data source, renders the full page with `renderToStringAsync`, and the client hydrates the same markup.

Demonstrated APIs (docs: [Async SSR](../../docs/en/server/streaming.md), [SSR Context & Request Isolation](../../docs/en/server/ssr-context.md)):

- `renderToStringAsync(component, props?, context?) => Promise<string>` — awaits async components before serializing
- `provide()` **after** an `await` + `inject()` in a descendant — the request scope survives async boundaries
- `<Suspense fallback>` — on the server the fallback never ships, because data resolves before serialization
- `hydrate()` — client reuses the server-rendered DOM

> **Trade-off:** the whole page is awaited before a single byte is sent — TTFB equals the slowest data source. True streaming (`renderToStream`) is not implemented yet; see the roadmap section in [docs/en/server/streaming.md](../../docs/en/server/streaming.md).

## Run

```bash
# development (Vite SSR module loader)
pnpm dev            # or: node server.js --port 4115

# production
pnpm build
NODE_ENV=production node server.js
```

## How it works

`src/entry-server.tsx` wraps the shared `App` in an async root that fetches and provides the data:

```tsx
const AsyncRoot = async () => {
  pageData = await fakeFetchTodos();     // ~120ms artificial delay
  provide(PageDataKey, pageData);        // after await — still request-scoped
  return <App />;
};

const html = await renderToStringAsync(AsyncRoot);
```

`server.js` serializes the resolved data into the document (`window.__ASYNC_SSR_DATA__`), and `src/entry-client.tsx` provides it back before hydrating:

```tsx
function ClientRoot() {
  provide(PageDataKey, window.__ASYNC_SSR_DATA__ ?? []);
  return <App />;
}

hydrate(ClientRoot, '#app');
```

### Why the async root lives in the entry, not in `App`

Client-side `hydrate()` mounts components synchronously — an `async` root component cannot be hydrated (its Promise would reach the DOM layer before resolving). So the shared `App` stays synchronous, and each entry supplies the data via `provide`:

- **server** — awaits `fakeFetchTodos()` inside an async root under `renderToStringAsync`
- **client** — reads the server-serialized `window.__ASYNC_SSR_DATA__`

Both sides inject the identical value, so hydration reuses the server DOM without mismatches.
