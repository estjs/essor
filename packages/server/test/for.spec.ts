import { describe, expect, it } from 'vitest';
import { signal } from '@estjs/signals';
import { For } from '../src/components';

describe('server/components/For', () => {
  it('renders an array of items', () => {
    expect(
      For({
        each: ['a', 'b', 'c'],
        children: (item, i) => `<li>${i}:${item}</li>`,
      }),
    ).toBe('<li>0:a</li><li>1:b</li><li>2:c</li>');
  });

  it('unwraps signals as input', () => {
    const items = signal([1, 2]);
    expect(For({ each: items as any, children: (item: number) => `<i>${item}</i>` })).toBe(
      '<i>1</i><i>2</i>',
    );
  });

  it('unwraps getter functions as input', () => {
    expect(
      For({
        each: () => ['x'],
        children: (item) => `<i>${item}</i>`,
      }),
    ).toBe('<i>x</i>');
  });

  it('renders fallback when list is empty', () => {
    expect(
      For({
        each: [],
        children: () => '<li/>',
        fallback: '<empty/>',
      }),
    ).toBe('<empty/>');
  });

  it('renders fallback when each is nullish', () => {
    expect(
      For({
        each: null as any,
        children: () => '<li/>',
        fallback: 'none',
      }),
    ).toBe('none');
  });

  it('returns empty string when no children render fn provided', () => {
    expect(
      For({
        each: [1],
        children: undefined as any,
      }),
    ).toBe('');
  });

  it('supports nested arrays returned by render fn', () => {
    expect(
      For({
        each: ['a', 'b'],
        children: (item) => [`<i>${item}`, `</i>`],
      }),
    ).toBe('<i>a</i><i>b</i>');
  });
});
