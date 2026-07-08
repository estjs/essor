import { describe, expect, it } from 'vitest';
import {
  ssrAttr,
  ssrBind,
  ssrClass,
  ssrSelected,
  ssrSpread,
  ssrStyle,
  ssrTextValue,
} from '../src/ssr';

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

    it('drops attribute names that would break out of the tag (XSS)', () => {
      // Attribute-name injection: a spread key such as `x onmouseover=alert(1)`
      // or one that closes the tag must not be emitted verbatim.
      expect(ssrAttr('x onmouseover=alert(1)', 'v')).toBe('');
      expect(ssrAttr('foo><script>alert(1)</script>', 'v')).toBe('');
      expect(ssrAttr('a"b', 'v')).toBe('');
      // Boolean form is guarded too.
      expect(ssrAttr('x onmouseover=alert(1)', true)).toBe('');
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

    it('normalizes nested style collections before serializing', () => {
      expect(
        ssrStyle({
          color: 'red',
          nested: { fontSize: '14px' },
          more: ['margin: 0;', { padding: '4px' }],
        }),
      ).toBe(' style="color:red;font-size:14px;margin:0;padding:4px"');
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

    it('drops unsafe attribute names from spread props (XSS)', () => {
      const result = ssrSpread({
        'id': 'ok',
        'x onmouseover=alert(1)': 'boom',
        'foo><script>': 'boom',
      });
      expect(result).toBe(' id="ok"');
    });
  });

  describe('ssrBind', () => {
    it('renders value attribute with string model', () => {
      expect(ssrBind('value', 'hello')).toBe(' value="hello"');
    });

    it('applies trim modifier', () => {
      expect(ssrBind('value', '  hi  ', { trim: true })).toBe(' value="hi"');
    });

    it('applies number modifier', () => {
      expect(ssrBind('value', '42', { number: true })).toBe(' value="42"');
    });

    it('does not coerce blank/whitespace to 0 with number modifier', () => {
      expect(ssrBind('value', '   ', { number: true })).toBe(' value="   "');
      expect(ssrBind('value', '', { number: true })).toBe(' value=""');
    });

    it('renders checked for truthy boolean model', () => {
      expect(ssrBind('checked', true)).toBe(' checked');
      expect(ssrBind('checked', false)).toBe('');
    });

    it('renders radio checked state by comparing model with own value', () => {
      expect(
        ssrBind('checked', 'dark', undefined, 'dark', {
          tag: 'input',
          type: 'radio',
        }),
      ).toBe(' checked');
      expect(
        ssrBind('checked', 'dark', undefined, 'light', {
          tag: 'input',
          type: 'radio',
        }),
      ).toBe('');
    });

    it('renders checked for checkbox group (array model)', () => {
      expect(ssrBind('checked', ['ts', 'react'], undefined, 'ts')).toBe(' checked');
      expect(ssrBind('checked', ['ts', 'react'], undefined, 'essor')).toBe('');
    });

    it('uses the browser default checkbox value for checkbox groups without a value attr', () => {
      expect(
        ssrBind('checked', ['on'], undefined, undefined, {
          tag: 'input',
          type: 'checkbox',
        }),
      ).toBe(' checked');
    });

    it('matches explicit empty checkbox values in checkbox groups', () => {
      expect(
        ssrBind('checked', [''], undefined, '', {
          tag: 'input',
          type: 'checkbox',
        }),
      ).toBe(' checked');
    });

    it('returns empty string for files binding', () => {
      expect(ssrBind('files', null)).toBe('');
    });

    it('returns empty string for array model on value binding', () => {
      expect(ssrBind('value', ['a', 'b'])).toBe('');
    });

    it('does not serialize select or textarea value bindings as attributes', () => {
      expect(ssrBind('value', 'shanghai', undefined, undefined, { tag: 'select' })).toBe('');
      expect(ssrBind('value', 'bio', undefined, undefined, { tag: 'textarea' })).toBe('');
    });
  });

  describe('ssrSelected', () => {
    it('renders selected when a single select model matches the option value', () => {
      expect(ssrSelected('dark', 'dark')).toBe(' selected');
      expect(ssrSelected('dark', 'light')).toBe('');
    });

    it('renders selected when a multiple select model contains the option value', () => {
      expect(ssrSelected(['ts', 'react'], 'react')).toBe(' selected');
      expect(ssrSelected(['ts', 'react'], 'essor')).toBe('');
    });

    it('returns empty string when no option value can be determined', () => {
      expect(ssrSelected(['on'], undefined)).toBe('');
    });
  });

  describe('ssrTextValue', () => {
    it('renders escaped textarea text with bind modifiers applied', () => {
      expect(ssrTextValue('  <bio>  ', { trim: true })).toBe('&lt;bio&gt;');
    });
  });
});
