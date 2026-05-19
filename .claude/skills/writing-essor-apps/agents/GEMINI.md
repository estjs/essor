# GEMINI.md - Essor App Writing Context

When writing Essor code, follow `AGENTS.md` if it is present. If not, use this compact context.

Essor is a signal-based frontend framework with no virtual DOM. `$`-prefixed local variables are compiler-transformed reactive state. Variables without `$` are not reactive.

## Must Follow

- Use `$` for local reactive state: `let $count = 0`, `const $items: Item[] = []`.
- Mutate reactive arrays/objects in place; do not replace them with spread clones.
- Prefer derived functions in JSX; use `computed()` only when `.value` or shared caching is required.
- Client-only apps use `createApp()`.
- SSR/SSG clients use `hydrate()` and must match server HTML exactly.
- Server code uses `renderToString()` or `renderToStringAsync()` from `@estjs/server`; do not use `renderToStream`.
- Component-scoped `effect()` is automatically disposed by Essor scope.
- Use `onDestroy()` for timers, event listeners, sockets, and other external resources.
- Import framework APIs from `essor` and SSR APIs from `@estjs/server`; local app modules and platform APIs are allowed when needed.

## Common Patterns

```tsx
<For each={$items} key={(item) => item.id}>
  {(item) => <ItemRow item={item} />}
</For>

const [data, { mutate, refetch }] = createResource(fetcher);

<Suspense fallback={<Loading />}>
  <View data={data()} />
</Suspense>

<input bind:value={$email} />
<input type="checkbox" bind:checked={$agree} />
```
