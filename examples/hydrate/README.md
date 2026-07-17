# Hydrate

A server-rendered static shell that becomes interactive on the client via `hydrate`, reusing the existing DOM instead of re-creating it.

## What it demonstrates

- `hydrate` — attaching reactivity and event listeners to pre-rendered markup ([docs](../../docs/en/server/ssr.md))
- `onMount` — flipping a status flag only after client hydration completes, so the UI can show "server shell" vs "hydrated client" ([docs](../../docs/en/api/lifecycle.md))
- `computed` — derived values (`preview`, `status`) that stay hydration-safe ([docs](../../docs/en/api/computed.md))
- `$`-prefixed variables — compiler-tracked reactive state ([docs](../../docs/en/api/signal.md))

## Run

```bash
pnpm install        # once, from the repo root
pnpm -C examples/hydrate dev
```

## Key code

Everything lives in [`src/main.tsx`](src/main.tsx). The entry calls `hydrate(App, '#app')` rather than `createApp`, so Essor walks the existing server-rendered DOM and binds to it instead of replacing it.

The `$hydrated` flag starts `false` (matching the server output) and is set to `true` inside `onMount`, which only runs on the client — the `status` computed then switches the visible label from "server shell" to "hydrated client".

The rest of the component proves interactivity survives hydration: two view sections ("overview" and "logs") are toggled by setting `$view` and hidden via the `hidden` attribute, and a `$draft` note can be loaded and cleared, with the `preview` computed showing the trimmed draft or a fallback.
