import { describe, expect, it } from 'vitest';
import { computed, signal } from '@estjs/signals';
import { setSSGAttr } from '../src/attrs';

describe('server/attrs', () => {
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
  });
});
