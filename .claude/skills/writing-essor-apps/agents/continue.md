---
name: Essor app rules
---

Use when editing Essor `.ts`/`.tsx`, app, example, demo, SSR, hydration, component, form, async data, or store code.

- Essor has no virtual DOM; it uses signal-based fine-grained reactivity.
- `$`-prefixed local variables are transformed by the Babel plugin into reactive state.
- Variables without `$` are plain JavaScript.
- Mutate reactive arrays/objects in place.
- Use `createApp()` for client-only apps and `hydrate()` for SSR/SSG clients.
- Server rendering uses `renderToString()` or `renderToStringAsync()` from `@estjs/server`.
- Do not use `renderToStream` in Essor 0.0.16-beta.8.
- Keep shared SSR/client initial render deterministic; browser-only work belongs in `onMount()`.
- Component-scoped `effect()` is auto-disposed by Essor scope.
- Clean timers/listeners/sockets/subscriptions with `onDestroy()`.
- Use stable keys for reorderable `<For>` lists.
- Use `Suspense` with async resources/components when loading coordination matters.
- Use `bind:value` for values and `bind:checked` for checkbox/radio.
- Import framework APIs from `essor` and SSR APIs from `@estjs/server`; local app modules and platform APIs are allowed when needed.
