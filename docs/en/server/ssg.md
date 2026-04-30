# Static Site Generation (SSG)

Static Site Generation (SSG) allows pages to be pre-rendered into static HTML files at build time. This combines the performance benefits of SSR with the low cost and high reliability of static hosting.

## What is SSG?

Unlike SSR, which dynamically generates HTML on every request, SSG generates HTML at build time. The generated HTML files can be deployed to any static file server (e.g., Nginx, Vercel, Netlify).

## createSSGComponent

In SSG mode, Essor provides `createSSGComponent` to optimize nested component rendering.

```typescript
import { createSSGComponent } from '@estjs/server';

function Header() {
  return <header>My Site Header</header>;
}

function Layout({ children }) {
  return (
    <div>
      {/* Statically render Header */}
      {createSSGComponent(Header, {})}
      <main>{children}</main>
    </div>
  );
}
```

`createSSGComponent` creates an independent rendering scope for a component, ensuring style and state isolation while generating efficient static HTML structures.

## Selective Hydration

When using SSG, many parts of a page (e.g., article content, footer) are purely static and do not need JavaScript execution on the client. Essor supports **selective hydration**, skipping the hydration process for these static parts to reduce client-side JavaScript execution time and memory usage.

```typescript
import { NoHydration } from '@estjs/server';

function BlogPost() {
  return (
    <div>
      <h1>Blog Title</h1>
      {/* Content wrapped in NoHydration will not be hydrated on the client */}
      <NoHydration>
        <article>
          <p>This is purely static content that does not need interactivity.</p>
          <p>Essor skips virtual DOM generation and diffing for this part on the client.</p>
        </article>
      </NoHydration>
    </div>
  );
}
```

This provides significant performance benefits for content-heavy applications like blogs and documentation sites.
