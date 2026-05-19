# Essor App Rules for Amazon Q Developer

Use as a project rule or custom agent context for Essor `.ts`/`.tsx`, app, example, demo, SSR, hydration, component, form, async data, and store work.

## Framework Rules

- Essor is signal-based and has no virtual DOM.
- `$`-prefixed local variables are compiler-transformed reactive state.
- Variables without `$` are plain JavaScript and will not update UI bindings.
- Mutate reactive arrays/objects in place.
- Prefer derived functions in JSX; use `computed()` when `.value` or shared caching is required.

## Rendering Rules

- Client-only apps use `createApp(App, '#app')`.
- SSR/SSG clients use `hydrate(App, '#app')`.
- Server output uses `renderToString()` or `renderToStringAsync()` from `@estjs/server`.
- Do not use `renderToStream` in Essor 0.0.16-beta.8.
- Server and client must use the same root component and container selector.

## Safety Rules

- Shared SSR/client render must not read browser globals or nondeterministic values.
- Move `window`, `document`, `localStorage`, `Date.now()`, and `Math.random()` work to `onMount()` or deterministic server props.
- Component-scoped `effect()` is automatically disposed by Essor scope.
- Clean timers, DOM listeners, sockets, and external subscriptions with lifecycle hooks.
- Do not import from internal `@estjs/*/src` paths in application code.
