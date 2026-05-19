# Essor App Instructions for GitHub Copilot

Use these instructions for Essor application, example, demo, `.tsx`, SSR, hydration, form, component, async data, and store code.

- Essor is signal-based and has no virtual DOM.
- `$`-prefixed local variables are compiler-transformed reactive state. Variables without `$` are plain JavaScript.
- Use `$` for local reactive state: `let $count = 0`, `const $items: Item[] = []`.
- Mutate reactive arrays/objects in place; avoid replacing them with spread clones.
- Prefer derived functions in JSX. Use `computed()` only when `.value` or shared caching is needed.
- Client-only apps use `createApp(App, '#app')`.
- SSR/SSG clients use `hydrate(App, '#app')`; never use `createApp()` on existing server HTML.
- Server rendering uses `renderToString()` or `renderToStringAsync()` from `@estjs/server`; Essor 0.0.16-beta.8 does not export `renderToStream`.
- Shared SSR/client render must not read `window`, `document`, `localStorage`, `Date.now()`, or `Math.random()`.
- Component-scoped `effect()` is automatically disposed by Essor. Do not add `onDestroy(() => runner.stop())` for normal component effects.
- Use `onDestroy()` for timers, DOM listeners, sockets, and external subscriptions.
- Use `<For>` with a stable `key` when list items can reorder.
- Use `<Suspense fallback={...}>` around async resources/components when loading coordination matters.
- `createResource()` returns `[resource, { mutate, refetch }]`; status fields are signals.
- Use `bind:value` for input/textarea/select and `bind:checked` for checkbox/radio.
- Import framework APIs from `essor` and SSR APIs from `@estjs/server`; do not import internal source paths from app code.
