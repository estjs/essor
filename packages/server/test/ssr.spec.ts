import { describe, expect, it } from 'vitest';
import { ssrAttr, ssrClass, ssrSpread, ssrStyle } from '../src/ssr';

describe('server/ssr helpers', () => {
  describe('ssrAttr', () => {
    it('handles nil, boolean, and escaped string values', () => {
      expect(ssrAttr('title', null)).toBe('');
      expect(ssrAttr('hidden', false)).toBe('');
      expect(ssrAttr('disabled', true)).toBe(' disabled');
      expect(ssrAttr('title', '<unsafe>"x"</unsafe>')).toBe(
        ' title="&lt;unsafe&gt;&quot;x&quot;&lt;/unsafe&gt;"',
      );
    });
  });

  describe('ssrClass', () => {
    it('normalizes strings, arrays, objects, and falsy values', () => {
      expect(ssrClass('btn primary')).toBe(' class="btn primary"');
      expect(ssrClass(['btn', { active: true, hidden: false }, ['nested']])).toBe(
        ' class="btn active nested"',
      );
      expect(ssrClass({ active: true, hidden: false })).toBe(' class="active"');
      expect(ssrClass(null)).toBe('');
    });
  });

  describe('ssrStyle', () => {
    it('serializes style strings and objects, including custom properties', () => {
      expect(ssrStyle('color:red')).toBe(' style="color:red"');
      expect(
        ssrStyle({
          'color': 'red',
          'fontSize': '14px',
          '--accent': '<unsafe>',
          'hidden': false,
        }),
      ).toBe(' style="color:red;font-size:14px;--accent:&lt;unsafe&gt;"');
    });

    it('returns an empty string for unsupported or empty values', () => {
      expect(ssrStyle(undefined)).toBe('');
      expect(ssrStyle({ hidden: false, gone: null })).toBe('');
      expect(ssrStyle(123)).toBe('');
    });
  });

  describe('ssrSpread', () => {
    it('skips special keys and delegates class/style serialization', () => {
      const result = ssrSpread({
        id: 'hero',
        class: ['banner', { visible: true }],
        style: { fontSize: '16px' },
        onClick: () => {},
        ref: {},
        children: 'ignored',
        title: '<unsafe>',
      });

      expect(result).toBe(
        ' id="hero" class="banner visible" style="font-size:16px" title="&lt;unsafe&gt;"',
      );
    });

    it('returns an empty string for non-object inputs', () => {
      expect(ssrSpread(null as any)).toBe('');
      expect(ssrSpread('nope' as any)).toBe('');
    });
  });
});
