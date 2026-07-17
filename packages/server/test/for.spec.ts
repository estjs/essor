import { describe, expect, it } from 'vitest';
import { signal } from '@estjs/signals';
import { For } from '../src/components';
import { unsafeHTML } from '../src/utils';

// For() returns a branded SSR node; String() yields the HTML
describe('server/components/For', () => {
  it('renders an array of items', () => {
    expect(
      String(
        For({
          each: ['a', 'b', 'c'],
          children: (item, i) => unsafeHTML(`<li>${i}:${item}</li>`),
        }),
      ),
    ).toBe('<li>0:a</li><li>1:b</li><li>2:c</li>');
  });

  it('unwraps signals as input', () => {
    const items = signal([1, 2]);
    expect(
      String(For({ each: items as any, children: (item: number) => unsafeHTML(`<i>${item}</i>`) })),
    ).toBe('<i>1</i><i>2</i>');
  });

  it('unwraps getter functions as input', () => {
    expect(
      String(
        For({
          each: () => ['x'],
          children: (item) => unsafeHTML(`<i>${item}</i>`),
        }),
      ),
    ).toBe('<i>x</i>');
  });

  it('renders fallback when list is empty', () => {
    expect(
      String(
        For({
          each: [],
          children: () => unsafeHTML('<li/>'),
          fallback: unsafeHTML('<empty/>'),
        }),
      ),
    ).toBe('<empty/>');
  });

  it('renders fallback when each is nullish', () => {
    expect(
      String(
        For({
          each: null as any,
          children: () => unsafeHTML('<li/>'),
          fallback: 'none',
        }),
      ),
    ).toBe('none');
  });

  it('returns empty string when no children render fn provided', () => {
    expect(
      String(
        For({
          each: [1],
          children: undefined as any,
        }),
      ),
    ).toBe('');
  });

  it('supports nested arrays returned by render fn', () => {
    expect(
      String(
        For({
          each: ['a', 'b'],
          children: (item) => [unsafeHTML(`<i>${item}`), unsafeHTML(`</i>`)],
        }),
      ),
    ).toBe('<i>a</i><i>b</i>');
  });
});
