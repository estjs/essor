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
hydrate(App, '#root', {
  // Optional config
  detectMismatches: true, // Detect server/client mismatch in development
});
```

The `hydrate` function reuses server-generated DOM nodes and attaches event listeners to bring the page to life.

## Streaming Rendering

In addition to `renderToString`, Essor supports streaming rendering, which progressively sends HTML content over the HTTP response stream. This is effective for reducing Time-To-First-Byte (TTFB).

For details, please refer to the [API documentation](../api/api).
