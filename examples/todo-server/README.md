# TodoMVC Server (SSR / SSG)

An isomorphic TodoMVC: the same `App` is rendered to HTML on the server with `renderToString`, optionally pre-rendered at build time (SSG), and hydrated on the client.

## What it demonstrates

- `renderToString` — server-side rendering the app to an HTML string ([docs](../../docs/en/server/ssr.md))
- `hydrate` — attaching the client bundle to the server-rendered markup ([docs](../../docs/en/server/ssr.md))
- SSG pre-rendering — baking the rendered HTML into `index.html` at build time ([docs](../../docs/en/server/ssg.md))
- Dual-entry setup — one shared `App`, separate client and server entry modules ([docs](../../docs/en/server/compiler-output.md))
- `$`-prefixed reactive state and `bind:value` powering the todo interactions ([docs](../../docs/en/guide/bind.md))

## Run

```bash
pnpm install        # once, from the repo root

# Development (Vite middleware mode, SSR on every request)
pnpm -C examples/todo-server dev          # http://localhost:3020

# Production build: client bundle + server bundle + SSG pre-render
pnpm -C examples/todo-server build

# Serve the production build
NODE_ENV=production node examples/todo-server/server.js                    # SSG static shell
NODE_ENV=production RENDER_MODE=ssr node examples/todo-server/server.js    # per-request SSR
```

Other scripts: `dev:ssr` (alias of `dev`), `preview` (Vite preview), `typecheck`. The server accepts `--port <n>` / `--port=<n>` or the `PORT` env var (default 3020), and `DIST_DIR` to point at an alternate build output.

## Key code

### Dual entries, one App

[`src/main.tsx`](src/main.tsx) exports the full TodoMVC `App` (seeded todos, add/edit/toggle/filter/clear flows) with no environment-specific code. [`src/entry-server.tsx`](src/entry-server.tsx) wraps it in a `render()` function that calls `renderToString(App)` from `@estjs/server`. [`src/entry-client.tsx`](src/entry-client.tsx) calls `hydrate(App, '#app')` so the browser reuses the server-rendered DOM instead of re-creating it. [`vite.config.ts`](vite.config.ts) uses a single isomorphic config: the Essor plugin compiles the client module graph in `hydrate` mode and auto-switches the SSR graph to `server` mode.

### The `<!--ssr-outlet-->` placeholder

[`index.html`](index.html) contains `<div id="app"><!--ssr-outlet--></div>`. Every render path works by substituting that comment with the app HTML: `renderDocument` in `server.js` does it per request, and `prerender.js` does it once at build time.

### server.js — one server, three modes

[`server.js`](server.js) is a dependency-free `node:http` server with three behaviors:

- **Development** (`NODE_ENV` not `production`): boots Vite in middleware mode, reads the raw `index.html`, runs it through `vite.transformIndexHtml` (injecting the HMR client), and compiles `src/entry-server.tsx` on the fly with `vite.ssrLoadModule` — SSR on every request with live reload.
- **Production SSG** (default): serves static assets from `dist/client` (with a path-traversal guard), and since `prerender.js` already replaced the outlet in `dist/client/index.html`, document requests get the pre-rendered static shell.
- **Production SSR** (`RENDER_MODE=ssr`): loads `dist/client/index.ssr.html` — the template copy that still contains the placeholder — and renders from the prebuilt `dist/server/entry-server.js` bundle per request.

### prerender.js — SSG step

[`prerender.js`](prerender.js) runs at the end of `pnpm build`. It imports the built server bundle, renders the app once, saves the untouched template as `dist/client/index.ssr.html` (preserving the placeholder for the SSR mode above), then writes the placeholder-substituted HTML back to `dist/client/index.html`. One build output therefore supports both static (SSG) and dynamic (SSR) serving.
