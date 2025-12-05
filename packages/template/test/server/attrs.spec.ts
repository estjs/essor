import { describe, expect, it } from 'vitest';
import { signal, computed } from '@estjs/signals';
import {
  normalizeClassName,
  normalizeProps,
  normalizeStyle,
  parseStyleString,
  setSSGAttr,
  styleObjectToString,
} from '../../src/server/attrs';

describe('server/attrs', () => {
  describe('normalizeStyle', () => {
    it('normalizes string style', () => {
      expect(normalizeStyle('color: red;')).toBe('color: red;');
    });

    it('normalizes object style', () => {
      expect(normalizeStyle({ color: 'red' })).toEqual({ color: 'red' });
    });

    it('normalizes array style', () => {
      expect(normalizeStyle([{ color: 'red' }, 'font-size: 14px'])).toEqual({
        color: 'red',
        'font-size': '14px',
      });
    });

    it('handles nested arrays', () => {
      expect(normalizeStyle([{ color: 'red' }, [{ fontSize: '14px' }]])).toEqual({
        color: 'red',
        fontSize: '14px',
      });
    });

    it('returns undefined for invalid types', () => {
      expect(normalizeStyle(null)).toBeUndefined();
      expect(normalizeStyle(123)).toBeUndefined();
    });
  });

  describe('parseStyleString', () => {
    it('parses simple style string', () => {
      expect(parseStyleString('color: red; font-size: 14px;')).toEqual({
        color: 'red',
        'font-size': '14px',
      });
    });

    it('removes comments', () => {
      expect(parseStyleString('color: red; /* comment */ font-size: 14px;')).toEqual({
        color: 'red',
        'font-size': '14px',
      });
    });

    it('handles empty string', () => {
      expect(parseStyleString('')).toEqual({});
    });
  });

  describe('styleObjectToString', () => {
    it('converts object to string', () => {
      expect(styleObjectToString({ color: 'red', fontSize: '14px' })).toBe(
        'color:red;font-size:14px;'
      );
    });

    it('handles CSS variables', () => {
      expect(styleObjectToString({ '--custom-prop': 'value' })).toBe('--custom-prop:value;');
    });

    it('returns string as is', () => {
      expect(styleObjectToString('color: red;')).toBe('color: red;');
    });

    it('returns empty string for falsy values', () => {
      expect(styleObjectToString(null as any)).toBe('');
      expect(styleObjectToString(undefined)).toBe('');
    });
  });

  describe('normalizeClassName', () => {
    it('normalizes string class', () => {
      expect(normalizeClassName('foo bar')).toBe('foo bar');
    });

    it('normalizes array class', () => {
      expect(normalizeClassName(['foo', 'bar'])).toBe('foo bar');
    });

    it('normalizes object class', () => {
      expect(normalizeClassName({ foo: true, bar: false, baz: true })).toBe('foo baz');
    });

    it('normalizes nested array class', () => {
      expect(normalizeClassName(['foo', ['bar', { baz: true }]])).toBe('foo bar baz');
    });
  });

  describe('normalizeProps', () => {
    it('normalizes class and style', () => {
      const props = {
        class: ['foo', 'bar'],
        style: [{ color: 'red' }, 'font-size: 14px'],
        id: 'test',
      };
      const normalized = normalizeProps(props);
      expect(normalized).toEqual({
        class: 'foo bar',
        style: { color: 'red', 'font-size': '14px' },
        id: 'test',
      });
    });

    it('returns null for null props', () => {
      expect(normalizeProps(null)).toBeNull();
    });
  });

  describe('setSSGAttr', () => {
    it('handles standard attributes', () => {
      expect(setSSGAttr('id', 'test', '1')).toBe(' id="test"');
    });

    it('handles boolean attributes', () => {
      expect(setSSGAttr('disabled', true, '1')).toBe(' disabled');
      expect(setSSGAttr('disabled', false, '1')).toBe('');
    });

    it('handles style attribute', () => {
      expect(setSSGAttr('style', { color: 'red' }, '1')).toBe(' style="color:red;"');
      expect(setSSGAttr('style', 'color: red;', '1')).toBe(' style="color: red;"');
    });

    it('handles class attribute', () => {
      expect(setSSGAttr('class', ['foo', 'bar'], '1')).toBe(' class="foo bar"');
    });

    it('ignores event listeners', () => {
      expect(setSSGAttr('onClick', () => { }, '1')).toBe('');
    });

    it('unwraps signals', () => {
      const count = signal(0);
      expect(setSSGAttr('data-count', count, '1')).toBe(' data-count="0"');
    });

    it('unwraps computed', () => {
      const count = signal(1);
      const double = computed(() => count.value * 2);
      expect(setSSGAttr('data-double', double, '1')).toBe(' data-double="2"');
    });

    it('returns empty string for null/undefined values', () => {
      expect(setSSGAttr('data-test', null, '1')).toBe('');
      expect(setSSGAttr('data-test', undefined, '1')).toBe('');
    });
  });
});
