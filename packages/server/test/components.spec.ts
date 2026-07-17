import { describe, expect, it } from 'vitest';
import { Fragment, Portal, Suspense } from '../src/components';
import { unsafeHTML } from '../src/utils';

// Built-in SSR components return a branded SSR node (so the compiled
// ssrComponent() boundary does not re-escape them); String() yields the HTML.
describe('server/components', () => {
  it('fragment renders children as a string', () => {
    expect(String(Fragment({ children: ['a', () => 'b', 1] }))).toBe('ab1');
  });

  it('portal renders children inline on the server', () => {
    expect(String(Portal({ children: ['before', unsafeHTML('<div>content</div>')] }))).toBe(
      'before<div>content</div>',
    );
  });

  it('suspense prefers children and falls back when children are nullish', () => {
    expect(String(Suspense({ children: 'ready', fallback: 'loading' }))).toBe('ready');
    expect(String(Suspense({ children: null, fallback: 'loading' }))).toBe('loading');
    expect(String(Suspense({ fallback: 'loading' }))).toBe('loading');
  });
});
