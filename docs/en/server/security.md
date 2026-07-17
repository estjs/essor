# Security & Escaping (SSR)

Essor's server renderer escapes untrusted output **by default**. This page documents the escaping contract, the `unsafeHTML()` opt-out, and how trust flows through component boundaries.

## The escaping contract

During SSR, **plain strings are never trusted**. Every bare string that reaches the output — whether returned from a hand-written component, passed as a `{expr}` child, used as a `Suspense`/`For` fallback, or forwarded through `props.children` — is HTML-escaped:

```typescript
import { renderToString } from '@estjs/server';

// A hand-written component returning raw markup as a plain string:
const Widget = () => '<b>hi</b>';

renderToString(Widget);
// Output: &lt;b&gt;hi&lt;/b&gt;   ← escaped, NOT parsed as HTML
```

This is deliberate XSS hardening: if user input ever ends up in a rendered string, it cannot inject markup.

```typescript
const userInput = '<img src=x onerror=alert(1)>';
const Comment = () => userInput;

renderToString(Comment);
// Output: &lt;img src=x onerror=alert(1)&gt;   ← attack neutralized
```

## How compiled JSX stays raw

You may wonder: if all strings are escaped, how does compiled JSX produce real HTML?

Trust is carried by an **unforgeable value brand**, not by a value's position or origin. The compiler emits branded *SSR node* objects for trusted nested JSX and component output. Only branded values pass through as raw HTML; everything else is escaped. Three things produce branded values:

1. Compiled `ssr()` / `ssrComponent()` output (what the Babel plugin generates from your JSX)
2. `escape()` results (already-escaped content, safe to re-enter the pipeline without double-escaping)
3. Explicit `unsafeHTML()` calls (see below)

Because the brand is a `WeakSet` membership on an object, a plain string can never impersonate a trusted value.

## unsafeHTML

`unsafeHTML()` explicitly marks a string as trusted raw HTML:

```typescript
import { renderToString, unsafeHTML } from '@estjs/server';

const Widget = () => unsafeHTML('<b>hi</b>');

renderToString(Widget);
// Output: <b>hi</b>
```

The name is intentionally alarming: **the caller vouches that the string is safe**. Passing unsanitized user input to `unsafeHTML()` reintroduces XSS:

```typescript
// ❌ NEVER do this with user-controlled data
const Comment = ({ text }) => unsafeHTML(text);

// ✅ Sanitize first (e.g. with DOMPurify on a jsdom instance), or
//    better: let JSX render the text as a child, which escapes it
const Comment = ({ text }) => <p>{text}</p>;
```

Use `unsafeHTML()` only for markup you generated or vetted yourself — e.g. output of a Markdown renderer with a strict sanitizer, or static HTML snippets.

## createSSRComponent returns a branded node

`createSSRComponent(Component, props)` renders a component subtree and returns a **branded SSR node** — already-safe HTML that can cross further component boundaries without double-escaping. `String()` converts it to the final HTML:

```typescript
import { createSSRComponent } from '@estjs/server';

const html = String(createSSRComponent(Header, {}));
```

## Migration note (0.0.18)

Before 0.0.18, hand-written components could return raw HTML strings and they were emitted verbatim. Since 0.0.18 those strings are escaped by default. If you relied on the old behavior, wrap the trusted markup in `unsafeHTML()`. See the [migration guide](/en/guide/migration) for details.

## Summary

| Value | SSR output |
|-------|-----------|
| Plain string (component return, child expr, fallback) | **Escaped** |
| Compiled JSX (`ssr()` / `ssrComponent()` output) | Raw (branded) |
| `escape(value)` result | Raw (already escaped once, branded) |
| `unsafeHTML(html)` | Raw — caller vouches for safety |
| `createSSRComponent(...)` result | Raw (branded) |
