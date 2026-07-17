# Static Site Generation (SSG)

Static Site Generation (SSG) allows pages to be pre-rendered into static HTML files at build time. This combines the performance benefits of SSR with the low cost and high reliability of static hosting.

## What is SSG?

Unlike SSR, which dynamically generates HTML on every request, SSG generates HTML at build time. The generated HTML files can be deployed to any static file server (e.g., Nginx, Vercel, Netlify).

## createSSRComponent

In SSG/SSR mode, Essor provides `createSSRComponent` to render a component subtree to an HTML string.

```typescript
import { createSSRComponent } from '@estjs/server';

function Header() {
  return <header>My Site Header</header>;
}

function Layout({ children }) {
  return (
    <div>
      {/* Statically render Header */}
      {createSSRComponent(Header, {})}
      <main>{children}</main>
    </div>
  );
}
```

`createSSRComponent` runs the component inside a child scope that inherits from the current active scope, so `inject()` resolves values from ancestor `provide()` calls while `provide()` inside the component stays scoped to it.

The return value is a **branded SSR node**: its content has already been safely serialized (bare strings inside were HTML-escaped), so it can flow through a parent component boundary without being escaped a second time. `String()` yields the rendered HTML. See [Security & Escaping](/en/server/security) for details on the escaping contract.

> `ssrComponent` is an alias of `createSSRComponent` kept for compiled-output stability; prefer `createSSRComponent` in handwritten code.

## Roadmap: Selective Hydration

Skipping client hydration for purely static regions (e.g., article bodies, footers) is on the roadmap but **not implemented yet** — there is currently no `NoHydration` component or equivalent API. Today the entire pre-rendered tree is hydrated by `hydrate()`.
