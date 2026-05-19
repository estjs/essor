# Essor App Rules for Cline

Apply when editing Essor `.ts` or `.tsx` app, example, demo, SSR, hydration, component, form, async data, or store code.

## Rules

- `$` prefix creates local reactive state through the Babel transform.
- No `$` prefix means plain JavaScript; UI will not update from it.
- Mutate reactive arrays and objects in place.
- Client-only entry: `createApp(App, '#app')`.
- SSR/SSG client entry: `hydrate(App, '#app')`.
- Server entry: `renderToString()` or `renderToStringAsync()` from `@estjs/server`.
- Do not use `renderToStream`; it is not public in Essor 0.0.16-beta.8.
- Shared SSR/client render must be deterministic.
- Do not read browser globals or nondeterministic values in shared render.
- Component-scoped `effect()` is auto-disposed by Essor scope.
- Clean up timers/listeners/sockets/subscriptions with lifecycle hooks.
- Use `For` keys for reorderable lists.
- Use `Suspense` for coordinated async UI.
- Use `bind:value` for values and `bind:checked` for checkbox/radio.
- Import framework APIs from `essor` and `@estjs/server`; do not import internal source paths from app code.

## Check Before Finishing

- `$` state is used where reactivity is required.
- SSR uses `hydrate()` on the client.
- Hydration output can match server HTML.
- External resources are cleaned up.
- No invented Essor API names appear in the code.
