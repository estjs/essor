import { describe, expect, it } from 'vitest';
import { Fragment, Portal, Suspense } from '../src/components';

// Built-in SSR components return a plain HTML string
describe('server/components', () => {
  it('fragment renders children as a string', () => {
    expect(Fragment({ children: ['a', () => 'b', 1] })).toBe('ab1');
  });

  it('portal renders children inline on the server', () => {
    expect(Portal({ children: ['before', '<div>content</div>'] })).toBe('before<div>content</div>');
  });

  it('suspense prefers children and falls back when children are nullish', () => {
    expect(Suspense({ children: 'ready', fallback: 'loading' })).toBe('ready');
    expect(Suspense({ children: null, fallback: 'loading' })).toBe('loading');
    expect(Suspense({ fallback: 'loading' })).toBe('loading');
  });
});
