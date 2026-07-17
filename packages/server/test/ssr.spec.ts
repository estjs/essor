import { describe, expect, it } from 'vitest';
import * as ssrRuntime from '../src/ssr';
import {
  ssrAttr,
  ssrBind,
  ssrClass,
  ssrSelected,
  ssrSpread,
  ssrStyle,
  ssrTextContent,
  ssrTextValue,
} from '../src/ssr';

const URL_ATTRIBUTE_NAMES = [
  'href',
  'SRC',
  'xlink:href',
  'ACTION',
  'formAction',
  'PoStEr',
] as const;

const UNSAFE_URLS = [
  ['mixed-case javascript protocol', 'JaVaScRiPt:alert(1)'],
  ['leading ASCII whitespace and controls', '\u0000\t\n  javascript:alert(1)'],
  ['interspersed ASCII controls including DEL', 'java\u0000\u001F\u007Fscript:alert(1)'],
  ['vbscript protocol', 'Vb\u000BScRiPt:msgbox(1)'],
  ['text/html data URL', 'data:text/html,<script>alert(1)</script>'],
  ['text/xml data URL', 'data:text/xml,<root/>'],
  ['application/xml data URL', 'data:application/xml,<root/>'],
  ['application/xhtml+xml data URL', 'data:application/xhtml+xml,<html/>'],
  ['image/svg+xml data URL', 'data:image/svg+xml,<svg onload="alert(1)"/>'],
  ['generic +xml data URL', 'DATA:application/atom+xml,<feed/>'],
] as const;

const SAFE_URLS = [
  '/docs/getting-started',
  'http://example.com/page',
  'https://example.com/page',
  'mailto:hello@example.com',
  'tel:+123456789',
  'data:image/png;base64,iVBORw0KGgo=',
  'data:font/woff2;base64,d09GMg==',
  'data:audio/ogg;base64,T2dnUw==',
] as const;

const COERCIBLE_UNSAFE_URLS = [
  ['boxed string', new Object('javascript:alert(1)')],
  ['custom toString', { toString: () => 'javascript:alert(1)' }],
] as const;

describe('server/ssr helpers', () => {
  it('exports the compiler whole-text serializer', () => {
    expect((ssrRuntime as Record<string, unknown>).ssrTextContent).toBeTypeOf('function');
  });

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

    it.each(URL_ATTRIBUTE_NAMES)('drops unsafe URL values for %s', (name) => {
      for (const [, value] of UNSAFE_URLS) {
        expect(ssrAttr(name, value)).toBe('');
      }
    });

    it.each(URL_ATTRIBUTE_NAMES)('preserves safe URL values for %s', (name) => {
      for (const value of SAFE_URLS) {
        expect(ssrAttr(name, value)).toBe(` ${name}="${value}"`);
      }
    });

    it.each(COERCIBLE_UNSAFE_URLS)('drops unsafe URL values from %s', (_, value) => {
      expect(ssrAttr('href', value)).toBe('');
    });

    it('coerces a URL value once and emits the checked string', () => {
      let calls = 0;
      const value = {
        toString() {
          calls += 1;
          return calls === 1 ? '/safe' : 'javascript:alert(1)';
        },
      };

      expect(ssrAttr('href', value)).toBe(' href="/safe"');
      expect(calls).toBe(1);
    });

    it('preserves boolean URL attributes and safely stringifies symbols', () => {
      expect(ssrAttr('href', true)).toBe(' href');
      expect(ssrAttr('href', Symbol('safe'))).toBe(' href="Symbol(safe)"');
    });

    it('preserves object coercion for non-URL attributes', () => {
      expect(ssrAttr('title', { toString: () => '<label>' })).toBe(' title="&lt;label&gt;"');
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

    it('inherits URL safety filtering from ssrAttr', () => {
      const result = ssrSpread({
        id: 'safe',
        href: 'javascript:alert(1)',
        src: '/assets/logo.png',
        poster: 'data:image/svg+xml,<svg onload="alert(1)"/>',
      });

      expect(result).toBe(' id="safe" src="/assets/logo.png"');
    });
  });

  describe('ssrBind', () => {
    it('renders value attribute with string model', () => {
      expect(ssrBind('value', 'hello')).toBe(' value="hello"');
    });

    it('does NOT pre-apply the trim modifier to the first paint (BIND-03)', () => {
      // trim/number normalize the DOM→model READ pipeline only; the SSR value
      // must match the client's initial model→DOM write (the raw model).
      expect(ssrBind('value', '  hi  ', { trim: true })).toBe(' value="  hi  "');
    });

    it('does NOT pre-apply the number modifier to the first paint (BIND-03)', () => {
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
    it('renders escaped textarea text WITHOUT pre-applying modifiers (BIND-03)', () => {
      // Modifiers belong to the DOM→model read pipeline; the SSR first paint
      // shows the raw model value (escaped), matching CSR's initial write.
      expect(ssrTextValue('  <bio>  ', { trim: true })).toBe('  &lt;bio&gt;  ');
    });

    it('renders escaped textarea text without modifiers', () => {
      expect(ssrTextValue('<bio>')).toBe('&lt;bio&gt;');
    });

    it('renders empty string for nullish and false models', () => {
      expect(ssrTextValue(null)).toBe('');
      expect(ssrTextValue(undefined)).toBe('');
      expect(ssrTextValue(false)).toBe('');
    });

    it('duplicates a leading LF so textarea bind values survive HTML parsing', () => {
      expect(ssrTextValue('\nline')).toBe('\n\nline');
    });
  });

  describe('ssrTextContent', () => {
    function parseText(tag: 'title' | 'textarea' | 'style', serialized: string): string {
      const template = document.createElement('template');
      template.innerHTML = `<${tag}>${serialized}</${tag}>`;
      return template.content.firstElementChild?.textContent ?? '';
    }

    it.each(['title', 'textarea'] as const)(
      'round-trips nested primitive values through <%s> RCDATA',
      (tag) => {
        const value = ['A<', ['&', null, false, '>B']];
        const serialized = ssrTextContent(tag, value);

        expect(serialized).not.toContain('A<&');
        expect(parseText(tag, serialized)).toBe('A<&>B');
      },
    );

    it('preserves a leading textarea LF after HTML parsing', () => {
      const serialized = ssrTextContent('textarea', '\nline');

      expect(serialized.startsWith('\n\n')).toBe(true);
      expect(parseText('textarea', serialized)).toBe('\nline');
    });

    it('round-trips safe style raw text without entity rewriting', () => {
      const value = 'a::before { content: "<&"; }';
      const serialized = ssrTextContent('style', value);

      expect(serialized).toBe(value);
      expect(parseText('style', serialized)).toBe(value);
    });

    it('rejects case-insensitive style end-tag breakout tokens', () => {
      expect(() => ssrTextContent('style', 'a{} </StYlE><script>alert(1)</script>')).toThrow(
        /<\/style>/i,
      );
    });

    it('preserves style text that only shares an end-tag name prefix', () => {
      expect(ssrTextContent('style', 'a::after { content: "</stylesheet>"; }')).toBe(
        'a::after { content: "</stylesheet>"; }',
      );
    });

    it('rejects executable script serialization as a defense-in-depth boundary', () => {
      expect(() => ssrTextContent('script', 'alert(1)')).toThrow(/dynamic <script>/i);
    });
  });
});
