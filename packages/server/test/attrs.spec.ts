import { describe, expect, it } from 'vitest';
import { computed, signal } from '@estjs/signals';
import { normalizeProps, ssrAttrDynamic } from '../src/attrs';

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

  describe('ssrAttrDynamic', () => {
    it('handles standard attributes', () => {
      expect(ssrAttrDynamic('id', 'test')).toBe(' id="test"');
    });

    it('handles boolean attributes', () => {
      expect(ssrAttrDynamic('disabled', true)).toBe(' disabled');
      expect(ssrAttrDynamic('disabled', false)).toBe('');
    });

    it('handles style attribute', () => {
      expect(ssrAttrDynamic('style', { color: 'red' })).toBe(' style="color:red;"');
      expect(ssrAttrDynamic('style', 'color: red;')).toBe(' style="color: red;"');
    });

    it('handles class attribute', () => {
      expect(ssrAttrDynamic('class', ['foo', 'bar'])).toBe(' class="foo bar"');
    });

    it('ignores event listeners', () => {
      expect(ssrAttrDynamic('onClick', () => {})).toBe('');
    });

    it('escapes class and style values to prevent attribute break-out (XSS)', () => {
      expect(ssrAttrDynamic('class', 'a" onmouseover="alert(1)')).toBe(
        ' class="a&quot; onmouseover=&quot;alert(1)"',
      );
      expect(ssrAttrDynamic('style', 'color:red" onload="alert(1)')).toBe(
        ' style="color:red&quot; onload=&quot;alert(1)"',
      );
      expect(ssrAttrDynamic('style', { color: 'red"><script>' })).toBe(
        ' style="color:red&quot;&gt;&lt;script&gt;;"',
      );
    });

    it('drops unsafe attribute names (XSS)', () => {
      expect(ssrAttrDynamic('x onmouseover=alert(1)', 'v')).toBe('');
    });

    it('unwraps signals', () => {
      const count = signal(0);
      expect(ssrAttrDynamic('data-count', count)).toBe(' data-count="0"');
    });

    it('unwraps computed', () => {
      const count = signal(1);
      const double = computed(() => count.value * 2);
      expect(ssrAttrDynamic('data-double', double)).toBe(' data-double="2"');
    });

    it('returns empty string for null/undefined values', () => {
      expect(ssrAttrDynamic('data-test', null)).toBe('');
      expect(ssrAttrDynamic('data-test', undefined)).toBe('');
    });

    it('returns empty string for style that normalizes to undefined', () => {
      // normalizeStyle returns undefined for non-array, non-string, non-object values
      // Numbers, booleans, etc. will cause normalizeStyle to return undefined
      expect(ssrAttrDynamic('style', 123)).toBe('');
      expect(ssrAttrDynamic('style', true)).toBe('');
    });

    it('handles empty style object by returning empty style attribute', () => {
      // Empty object {} is truthy, so normalizeStyle returns it, then styleToString returns ''
      expect(ssrAttrDynamic('style', {})).toBe(' style=""');
    });

    it('handles zero value for attributes', () => {
      expect(ssrAttrDynamic('data-count', 0)).toBe(' data-count="0"');
    });

    it('returns empty string for empty class', () => {
      expect(ssrAttrDynamic('class', '')).toBe('');
    });

    it('returns empty string for class object with all false values', () => {
      expect(ssrAttrDynamic('class', { active: false, disabled: false })).toBe('');
    });

    it('escapes special characters in standard attribute values (XSS prevention)', () => {
      expect(ssrAttrDynamic('title', '"break" <out>')).toBe(
        ' title="&quot;break&quot; &lt;out&gt;"',
      );
    });
  });
});
