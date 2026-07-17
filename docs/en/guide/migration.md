# Migration Guide

This page tracks breaking changes between Essor releases and how to upgrade.

## 0.0.18

### SSR: bare strings are now escaped by default (breaking)

**Before**: a hand-written component returning a raw HTML string had it emitted verbatim during SSR.

**After**: every bare string is HTML-escaped. Only branded values — compiled JSX output, `escape()` results, and explicit `unsafeHTML()` — pass through raw.

```typescript
// BEFORE (≤0.0.17): output was <b>hi</b>
const Widget = () => '<b>hi</b>';

// AFTER (0.0.18+): output is &lt;b&gt;hi&lt;/b&gt;
// Fix — vouch for the markup explicitly:
import { unsafeHTML } from '@estjs/server';
const Widget = () => unsafeHTML('<b>hi</b>');
```

**Who is affected**: only hand-written components that return raw HTML *strings*. JSX-based components are unaffected — the compiler output is branded automatically.

**Why**: XSS hardening. Any user input flowing into a rendered string can no longer inject markup. See [Security & Escaping](/en/server/security) for the full contract.

### createSSRComponent returns a branded SSR node

`createSSRComponent` (and its compiled alias `ssrComponent`) now returns a branded SSR node instead of a plain string. Template-literal interpolation and `String()` conversion still work exactly as before, so most code needs no change. Code that did strict `typeof x === 'string'` checks on the result should use `String(x)` first.

### renderToString throws on async components

Passing an `async` component to `renderToString` now throws immediately instead of silently serializing `[object Promise]` into the HTML. Use `renderToStringAsync` — see [Async SSR](/en/server/streaming).

## Older versions

No migration notes were recorded for earlier releases. See the [changelog](https://github.com/estjs/essor/blob/main/CHANGELOG.md) for the full history.
