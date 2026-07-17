# Server-Side Rendering (SSR)

Server-Side Rendering (SSR) is one of the core features of the Essor framework. It allows components to be rendered into HTML strings on the server and sent directly to the client, improving First Contentful Paint (FCP) and SEO.

## Why SSR?

- **Better SEO**: Search engine crawlers can read the server-generated HTML content directly.
- **Faster First Paint**: Users see page content without waiting for JavaScript to download and execute.
- **Unified Development**: Use the same component code on both server and client.

## Basic Usage

Essor provides `renderToString` to render components as HTML strings.

```typescript
import { renderToString } from '@estjs/server';

function App({ title }) {
  return (
    <div>
      <h1>{title}</h1>
      <p>Hello, Essor SSR!</p>
    </div>
  );
}

// Call on the server
const html = renderToString(App, { title: 'My SSR App' });
console.log(html);
// Output: <div data-hk="0"><h1 data-hk="1">My SSR App</h1><p data-hk="2">Hello, Essor SSR!</p></div>
```

## Client Hydration

Server-rendered HTML is static markup. To make the page interactive, client-side hydration is required.

```typescript
import { hydrate } from 'essor';

// Client entry file
hydrate(App, '#root');
```

The `hydrate` function takes the component and a target (a CSS selector string or an `Element`). It reuses server-generated DOM nodes and attaches event listeners to bring the page to life. In development mode, mismatches between server and client markup are reported as console warnings.

## Async Rendering

`renderToString` is synchronous and throws when a component returns a Promise. For `async` components and promise-returning expressions, use `renderToStringAsync` — it awaits the whole tree and resolves to the final HTML. See [Async SSR](/en/server/streaming) for details. True streaming output is on the roadmap but not implemented yet.

## Escaping & Security

Bare strings returned from hand-written components are HTML-escaped by default; trusted raw markup must opt in via `unsafeHTML()`. See [Security & Escaping](/en/server/security).

## Related pages

- [SSR Context & Request Isolation](/en/server/ssr-context) — `createSSRContext`, Portal teleports, concurrent-render isolation
- [SSG](/en/server/ssg) — build-time pre-rendering and `createSSRComponent`
