# API Reference

## Core API

- [`signal`](./signal.md) - Create a reactive signal
- [`computed`](./computed.md) - Create a computed property
- [`effect`](./effect.md) - Create an effect that automatically tracks dependencies
- [`watch`](./watch.md) - Watch for changes in reactive data sources

## Reactive Objects

- [`reactive`](./reactive.md) - Create a deeply reactive object
- [`shallowReactive`](./reactive.md#shallowreactive) - Create a shallow reactive object
- [`isReactive`](./reactive.md#isreactive) - Check if an object is reactive
- [`toRaw`](./reactive.md#toraw) - Get the raw object from a reactive object

## Utility Functions

- [`batch`](./batch-updates.md) - Batch updates
- [`untrack`](./effect.md#untrack) - Execute a function without tracking dependencies
- [`nextTick`](./batch-updates.md) - Execute a callback in the next microtask

## Runtime Components

- [`createApp`](./runtime-api.md) - Mount an application to the DOM
- [`hydrate`](./runtime-api.md#hydrate) - Hydrate SSR-rendered HTML
- [`definePlugin`](./runtime-api.md#defineplugin) - Define a plugin
- [`template`](./runtime-api.md#template) - DOM template factory
- [`For`](./runtime-api.md#for) - List rendering
- [`Fragment`](../components/Fragment.md) - Fragment rendering
- [`Portal`](../components/Portal.md) - Portal rendering
- [`Suspense`](../components/Suspense.md) - Async loading

## Lifecycle & DI

- [`onMount`](./lifecycle.md#onmount) - Component mount hook
- [`onUpdate`](./lifecycle.md#onupdate) - Component update hook
- [`onDestroy`](./lifecycle.md#ondestroy) - Component destroy hook
- [`provide`](./provide-inject.md#provide) / [`inject`](./provide-inject.md#inject) - Dependency injection

## State Management

- [`createStore`](./store.md) - Create a reactive state manager
- [`StoreActions`](./store.md#storeactions) - Built-in store actions interface
