import { describe, expect, it } from 'vitest';
import { computed, signal } from '@estjs/signals';
import { normalizeProps, setSSGAttr } from '../src/attrs';

describe('server/attrs', () => {
  describe('normalizeProps', () => {
    it('returns null for null props', () => {
      expect(normalizeProps(null)).toBe(null);
    });

    it('passes through string class unchanged', () => {
      const props = { class: 'foo bar' };
      const result = normalizeProps(props);
      expect(result?.class).toBe('foo bar');
    });

    it('normalizes array class to string', () => {
      const props = { class: ['foo', 'bar'] };
      const result = normalizeProps(props);
      expect(result?.class).toBe('foo bar');
    });

    it('normalizes object class to string', () => {
      const props = { class: { active: true, disabled: false } };
      const result = normalizeProps(props);
      expect(result?.class).toBe('active');
    });

    it('normalizes style object', () => {
      const props = { style: { color: 'red', fontSize: '14px' } };
      const result = normalizeProps(props);
      expect(result?.style).toEqual({ color: 'red', fontSize: '14px' });
    });

    it('normalizes style string', () => {
      const props = { style: 'color: red;' };
      const result = normalizeProps(props);
      expect(result?.style).toBe('color: red;');
    });

    it('handles props with both class and style', () => {
      const props = { class: ['foo'], style: { color: 'blue' } };
      const result = normalizeProps(props);
      expect(result?.class).toBe('foo');
      expect(result?.style).toEqual({ color: 'blue' });
    });

    it('preserves other props unchanged', () => {
      const props = { 'id': 'test', 'data-value': 123, 'class': ['a'] };
      const result = normalizeProps(props);
      expect(result?.id).toBe('test');
      expect(result?.['data-value']).toBe(123);
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
      expect(setSSGAttr('onClick', () => {}, '1')).toBe('');
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

    it('returns empty string for style that normalizes to undefined', () => {
      // normalizeStyle returns undefined for non-array, non-string, non-object values
      // Numbers, booleans, etc. will cause normalizeStyle to return undefined
      expect(setSSGAttr('style', 123, '1')).toBe('');
      expect(setSSGAttr('style', true, '1')).toBe('');
    });

    it('handles empty style object by returning empty style attribute', () => {
      // Empty object {} is truthy, so normalizeStyle returns it, then styleToString returns ''
      expect(setSSGAttr('style', {}, '1')).toBe(' style=""');
    });

    it('handles zero value for attributes', () => {
      expect(setSSGAttr('data-count', 0, '1')).toBe(' data-count="0"');
    });

    it('returns empty string for empty class', () => {
      expect(setSSGAttr('class', '', '1')).toBe('');
    });

    it('returns empty string for class object with all false values', () => {
      expect(setSSGAttr('class', { active: false, disabled: false }, '1')).toBe('');
    });
  });
});
