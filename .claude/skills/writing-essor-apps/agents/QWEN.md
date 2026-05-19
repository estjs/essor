# QWEN.md - Essor App Writing Context

Use for Qwen Code or Gemini-compatible coding agents when working on Essor app code.

Essor is signal-based and has no virtual DOM. `$`-prefixed local variables are transformed into reactive state by the Babel plugin. Variables without `$` are plain JavaScript.

Rules:

- Use `$` for local reactive state.
- Mutate reactive arrays/objects in place; do not replace them with spread clones.
- Client-only apps use `createApp()`.
- SSR/SSG clients use `hydrate()`.
- Server rendering uses `renderToString()` or `renderToStringAsync()` from `@estjs/server`.
- Do not use `renderToStream` in Essor 0.0.16-beta.8.
- Shared SSR/client render must be deterministic; browser-only work belongs in `onMount()`.
- Component-scoped `effect()` is automatically disposed by Essor scope.
- Use lifecycle cleanup for timers, event listeners, sockets, and subscriptions.
- Import framework APIs from `essor` and server APIs from `@estjs/server`; local app modules and platform APIs are allowed when needed.
