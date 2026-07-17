# Essor Examples

Runnable example projects, each demonstrating one focused slice of the framework. Every example doubles as an e2e fixture — see [`e2e/README.md`](../e2e/README.md) for how they are served and tested.

## Running

```bash
pnpm install                       # once, from the repo root
pnpm -C examples/<name> dev        # start one example
```

## Coverage matrix

| Example | Demonstrates | Docs | E2E spec |
|---------|--------------|------|----------|
| [signals](./signals) | `signal`, `computed`, `batch` | [signal](../docs/en/api/signal.md), [computed](../docs/en/api/computed.md), [batch](../docs/en/api/batch.md) | `signals.spec.ts` |
| [watch-effect](./watch-effect) | `watch` (immediate/once/multi-source), `effect` + cleanup, `untrack` | [watch](../docs/en/api/watch.md), [effect](../docs/en/api/effect.md) | `watch-effect.spec.ts` |
| [store](./store) | `createStore` state/getters/actions, cross-component sharing | [store](../docs/en/api/store.md) | `store.spec.ts` |
| [provide](./provide) | `provide`/`inject` with Symbol keys, `reactive` shared state | [provide-inject](../docs/en/api/provide-inject.md), [reactive](../docs/en/api/reactive.md) | `provide.spec.ts` |
| [binding](./binding) | `bind:value/checked/files` + `trim`/`number`/`lazy` modifiers | [bind guide](../docs/en/guide/bind.md) | `binding.spec.ts` |
| [fragment](./fragment) | JSX fragments (`<>`) rendering sibling nodes without wrappers | [Fragment](../docs/en/components/Fragment.md) | `fragment.spec.ts` |
| [for-list](./for-list) | `<For>` keyed node reuse & identity semantics vs `.map()` | [runtime API](../docs/en/api/runtime-api.md) | `for-list.spec.ts` |
| [portal](./portal) | `<Portal>` with reactive `target` and `disabled` | [Portal](../docs/en/components/Portal.md) | `portal.spec.ts` |
| [suspense](./suspense) | `<Suspense>` + `createResource` with AbortSignal cancellation | [Suspense](../docs/en/components/Suspense.md), [resources](../docs/en/server/resources.md) | `suspense.spec.ts` |
| [error-handling](./error-handling) | `createResource` error/state signals, retry via `refetch` | [Suspense § error handling](../docs/en/components/Suspense.md) | `error-handling.spec.ts` |
| [transition](./transition) | `<Transition>` (CSS/JS/appear/hooks) + `<TransitionGroup>` FLIP | [transition guide](../docs/en/guide/transition.md) | `transition.spec.ts` |
| [todo-mvc](./todo-mvc) | Client-only app: reactive array, filters, inline edit | [reactive](../docs/en/api/reactive.md) | `todo-mvc.spec.ts` |
| [hydrate](./hydrate) | `hydrate()` attaching interactivity to a static shell | [SSR § hydration](../docs/en/server/ssr.md) | `hydrate.spec.ts` |
| [todo-server](./todo-server) | Full SSR/SSG: `renderToString`, prerender, dev/prod server | [SSR](../docs/en/server/ssr.md), [SSG](../docs/en/server/ssg.md) | `todo-server.spec.ts` |
| [async-ssr](./async-ssr) | `renderToStringAsync`, async components, provide/inject across await | [Async SSR](../docs/en/server/streaming.md), [SSR context](../docs/en/server/ssr-context.md) | `async-ssr.spec.ts` |
| [hmr](./hmr) | Hot module replacement (Vite + Rspack), state preservation | — | `hmr.spec.ts`, `hmr-rspack.spec.ts` |

## Baseline configuration

All examples share the same baseline; new examples should copy it from `signals`:

- **package.json** — `essor: workspace:*` dependency; `unplugin-essor: workspace:*`, `vite ^8.1.3`, `typescript ^6.0.3`, `@types/node ^26.1.0` dev deps; `dev`/`build`/`preview`/`typecheck` scripts.
- **vite.config.ts** — `essor({ hmr: false, mode: 'client' })` (hydrate/todo-server/async-ssr use `mode: 'hydrate'`; hmr uses `hmr: true`), plus the `process.env.E2E` server block that disables HMR/watching under e2e.
- **tsconfig.json** — `jsx: preserve`, `jsxImportSource: essor`, `strict: true`, `moduleResolution: bundler`.
- **index.html** — formatted 12-line shell with `<div id="app">` (hydrate-mode examples embed the pre-rendered shell / `<!--ssr-outlet-->`).
- **src/main.tsx** — root element must carry `data-test="example-root"` (the e2e `examplePage` fixture waits for it), and interactive elements should have `data-test` attributes.

Adding an example: create the directory, register a port in [`e2e/example-registry.ts`](../e2e/example-registry.ts) (next free, currently 4117+), write an `e2e/<name>.spec.ts`, add a `README.md`, and extend this matrix.
