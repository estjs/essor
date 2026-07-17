# Compiler Output API (`ssr*` helpers)

::: warning Internal API
The functions on this page are **compiler targets**: they are called by the code that `babel-plugin-essor` generates in server mode. They are not designed to be called from hand-written code, and their signatures and semantics may change with any compiler version without a semver-major release. Do not treat them as stable public API.
:::

## Why they are exported

The Babel plugin compiles JSX into plain JavaScript that must `import` these helpers from `@estjs/server` at runtime. They therefore have to be part of the package's export surface — being importable does not make them public API.

Many of these helpers rely on a trust contract with the compiler: for example, `render()` concatenates string slots **verbatim**, assuming each slot was already escaped by a compile-time-chosen helper. Calling them by hand with user input bypasses that contract and can reintroduce XSS.

## Reference table

| Export | One-line purpose |
| --- | --- |
| `ssr` | Compiler-only template helper; same concatenation as `render` but returns a trusted SSR node so nested JSX avoids double-escaping. |
| `render` | Interleaves static template fragments with pre-serialized slot strings (concatenated verbatim, no escaping here) and injects the hydration key. |
| `ssrComponent` | Plain alias of `createSSRComponent`, kept for compiled-output stability. |
| `ssrAttr` | Renders a single attribute as an escaped attribute fragment (e.g. ` name="v"`); drops unsafe attribute names. |
| `ssrAttrDynamic` | Renders a dynamic attribute string, unwrapping reactive values and specially handling `class`/`style`/boolean/event attributes. |
| `ssrClass` | Renders a `class` attribute (string, object, or array value) as an escaped attribute fragment. |
| `ssrStyle` | Renders a `style` attribute (string or object value) as an escaped attribute fragment. |
| `ssrBind` | Renders the initial value of a `bind:*` two-way binding as an HTML attribute string so pre-hydration markup matches the client. |
| `ssrSelected` | Renders the `selected` attribute for an `<option>` inside a bound `<select>`. |
| `ssrTextValue` | Renders escaped initial text for `<textarea bind:value>`. |
| `ssrSpread` | Renders a props spread as an escaped attribute fragment, skipping event handlers and special keys. |
| `normalizeProps` | Normalizes component props, converting `class`/`style` to their normalized forms. |
| `escape` | Serializes an `{expr}` child slot, escaping bare strings; the result is branded so it will not be escaped a second time. |
| `resolve` | Serializes a component return value at the component boundary: recurses arrays/thunks, escapes bare strings, returns a plain string. |
| `escapeHTML` | Escapes HTML special characters in a string to entity references (re-exported from `@estjs/shared`). |
| `injectHydrationKeys` | Adds hydration attributes (`data-hk` etc.) to rendered HTML content. |
| `getHydrationKey` | Returns the next hydration key from the per-request counter (re-exported from `@estjs/template`). |
| `resetHydrationKey` | Resets the hydration key counter (re-exported from `@estjs/template`). |
| `TELEPORT_CALLSITE_ANCHOR` / `TELEPORT_BLOCK_START` / `TELEPORT_BLOCK_END` | Comment-marker constants used by SSR `Portal` to mark teleport call sites and teleported content blocks. |

## What hand-written code should use

For hand-written SSR code, use the public APIs instead:

- `renderToString` / `renderToStringAsync` and `createSSRComponent` — see [Server-Side Rendering](/en/server/ssr)
- `unsafeHTML` for explicitly trusted raw HTML — see [Security & Escaping](/en/server/security)
- `createSSRContext` / `getSSRContext` — see [SSR Context](/en/server/ssr-context)
