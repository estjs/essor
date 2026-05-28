# API Overview

Essor APIs are organized into three categories: reactive core, runtime components, and utilities.

## Reactive Core (@estjs/signals)

- [`signal`](./signal.md) — Create a reactive signal
- [`computed`](./computed.md) — Create a computed property
- [`effect`](./effect.md) — Create an auto-tracking side effect
- [`watch`](./watch.md) — Watch reactive data changes
- [`reactive`](./reactive.md) — Create a deeply reactive object
- [`store`](./store.md) — Create a state manager

## Runtime Components (@estjs/template)

- [`createApp`](./runtime-api.md#createapp) — Mount an application to the DOM
- [`hydrate`](./runtime-api.md#hydrate) — Hydrate SSR-rendered HTML on the client
- [`definePlugin`](./runtime-api.md#defineplugin) — Define a plugin with typed options
- [`template`](./runtime-api.md#template) — Create a reusable DOM template factory
- [`For`](./runtime-api.md#for) — List rendering component
- [`Fragment`](./runtime-api.md#fragment) — Render multiple children without wrapper nodes
- [`Portal`](./runtime-api.md#portal) — Render children into a specified DOM node
- [`Suspense`](./runtime-api.md#suspense) — Async loading state management
- [`createResource`](./runtime-api.md#createresource) — Create async data resources

## Lifecycle & DI

- [`onMount`](./lifecycle.md#onmount) — Component mount hook
- [`onUpdate`](./lifecycle.md#onupdate) — Component update hook
- [`onDestroy`](./lifecycle.md#ondestroy) — Component destroy hook
- [`onCleanup`](./lifecycle.md#oncleanup) — Register cleanup functions
- [`provide`](./provide-inject.md#provide) / [`inject`](./provide-inject.md#inject) — Cross-level dependency injection

## Utilities

- [`batch`](./batch-updates.md) — Batch signal updates
- [`untrack`](./effect.md#untrack) — Read values without tracking dependencies
- [`nextTick`](./batch-updates.md#nexttick) — Execute callback in next microtask

## SSR / SSG (@estjs/server)

- [`renderToString`](../server/ssr.md) — Render a component to an HTML string
- [`createSSGComponent`](../server/ssg.md) — Optimize nested component rendering for SSG
