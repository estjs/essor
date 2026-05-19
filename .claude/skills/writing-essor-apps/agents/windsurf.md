# Essor App Rule for Windsurf Cascade

Description: Use when Cascade edits Essor `.ts`/`.tsx`, app, example, demo, SSR, hydration, form, component, store, or async data code.

## Instructions

- Essor uses compiler-transformed `$` local state. Use `$` for reactive variables.
- Variables without `$` are not reactive.
- Mutate reactive arrays/objects in place; do not replace them with spread clones.
- Prefer derived functions in JSX. Use `computed()` only for `.value` access or shared caching.
- Use `createApp()` only for client-only apps with no server HTML.
- Use `hydrate()` for SSR/SSG pages with existing HTML.
- Use `renderToString()` or `renderToStringAsync()` from `@estjs/server`; do not use `renderToStream`.
- Keep SSR/client initial render deterministic. Move browser-only work to `onMount()`.
- Component-scoped `effect()` is auto-disposed by Essor scope.
- Use `onDestroy()` for timers, DOM listeners, sockets, and external subscriptions.
- Use stable `<For key={...}>` for reorderable lists.
- Use `<Suspense fallback={...}>` for async resources/components when loading coordination matters.
- Import framework APIs from `essor` and server APIs from `@estjs/server`; local app modules and platform APIs are allowed when needed.

Install as a Windsurf workspace rule. Keep it short enough to fit Windsurf rule limits.
