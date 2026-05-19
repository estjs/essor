# Claude Project Instructions: Essor Apps

When editing Essor app, example, demo, `.tsx`, SSR, hydration, component, form, async data, or store code, load `.claude/skills/writing-essor-apps/SKILL.md` if available.

Core reminders:

- `$`-prefixed local variables are compiler-transformed reactive state; no `$` means plain JavaScript.
- Mutate reactive arrays/objects in place.
- Use `createApp()` only for client-only apps.
- Use `hydrate()` for SSR/SSG clients.
- Use `renderToString()` or `renderToStringAsync()` from `@estjs/server`; do not use `renderToStream` in Essor 0.0.16-beta.8.
- Component-scoped `effect()` is automatically disposed by Essor scope.
- Clean timers, DOM listeners, sockets, and external subscriptions with lifecycle hooks.
- Import framework APIs from `essor` and SSR APIs from `@estjs/server`; local app modules and platform APIs are allowed when needed.
