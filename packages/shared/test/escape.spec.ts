import { escapeHTML, escapeHTMLComment, getEscapedCssVarName } from '../src';

describe('escape Utils', () => {
  describe('escapeHTML', () => {
    const testCases = [
      { input: '<div>', expected: '&lt;div&gt;' },
      { input: '"quote"', expected: '&quot;quote&quot;' },
      { input: '&ampersand', expected: '&amp;ampersand' },
      { input: "'single'", expected: '&#39;single&#39;' },
      {
        input: '<div class="test">&</div>',
        expected: '&lt;div class=&quot;test&quot;&gt;&amp;&lt;/div&gt;',
      },
      { input: '', expected: '' },
      { input: 'normal text', expected: 'normal text' },
      { input: 123, expected: '123' },
      { input: null, expected: 'null' },
      { input: undefined, expected: 'undefined' },
    ];

    testCases.forEach(({ input, expected }) => {
      it(`should escapeHTML '${input}' to '${expected}'`, () => {
        expect(escapeHTML(input)).toBe(expected);
      });
    });

    it('should escape all HTML special characters', () => {
      const input = '<>&"\'test';
      const expected = '&lt;&gt;&amp;&quot;&#39;test';
      expect(escapeHTML(input)).toBe(expected);
    });

    it('should handle text without special characters efficiently', () => {
      const input = 'Hello World 123';
      expect(escapeHTML(input)).toBe(input);
    });

    it('should handle consecutive special characters', () => {
      const input = '<<<>>>&&&"""\'\'\'';
      const expected = '&lt;&lt;&lt;&gt;&gt;&gt;&amp;&amp;&amp;&quot;&quot;&quot;&#39;&#39;&#39;';
      expect(escapeHTML(input)).toBe(expected);
    });

    it('should convert non-string values to strings before escaping', () => {
      expect(escapeHTML(true)).toBe('true');
      expect(escapeHTML(false)).toBe('false');
      expect(escapeHTML(0)).toBe('0');
      expect(escapeHTML({})).toContain('[object Object]');
    });
  });

  describe('escapeHTMLComment', () => {
    const testCases = [
      { input: '<!-- comment -->', expected: ' comment ' },
      { input: 'text <!-- comment --> text', expected: 'text  comment  text' },
      { input: '<!-- outer <!-- inner --> outer -->', expected: ' outer  inner  outer ' },
      { input: '', expected: '' },
      { input: 'normal text', expected: 'normal text' },
      { input: '--!> comment', expected: ' comment' },
      { input: '<!- comment', expected: '<!- comment' },
      { input: '-> comment', expected: ' comment' },
    ];

    testCases.forEach(({ input, expected }) => {
      it(`should escapeHTML comment '${input}' to '${expected}'`, () => {
        expect(escapeHTMLComment(input)).toBe(expected);
      });
    });

    it('should strip all comment markers', () => {
      const input = '<!--->test<!---->more-->text';
      const result = escapeHTMLComment(input);
      expect(result).not.toContain('<!--');
      expect(result).not.toContain('-->');
    });

    it('should handle multiple comment markers in sequence', () => {
      const input = '<!--<!----!>text-->';
      expect(escapeHTMLComment(input)).not.toContain('<!--');
    });

    it('should preserve text between comment markers', () => {
      const input = 'start<!-- middle -->end';
      const result = escapeHTMLComment(input);
      expect(result).toContain('start');
      expect(result).toContain('middle');
      expect(result).toContain('end');
    });
  });

  describe('getEscapedCssVarName', () => {
    const testCases = [
      { key: 'foo bar', doubleEscape: false, expected: 'foo\\ bar' },
      { key: 'foo@bar', doubleEscape: false, expected: 'foo\\@bar' },
      { key: 'foo:bar', doubleEscape: false, expected: 'foo\\:bar' },
      { key: 'foo bar', doubleEscape: true, expected: 'foo\\\\ bar' },
      { key: 'foo@bar', doubleEscape: true, expected: 'foo\\\\@bar' },
      { key: 'foo:bar', doubleEscape: true, expected: 'foo\\\\:bar' },
      { key: 'foobar', doubleEscape: false, expected: 'foobar' },
      { key: 'foo-bar', doubleEscape: false, expected: 'foo-bar' },
      { key: '', doubleEscape: false, expected: '' },
    ];

    testCases.forEach(({ key, doubleEscape, expected }) => {
      it(`should escapeHTML CSS var name '${key}' (doubleEscape: ${doubleEscape}) to '${expected}'`, () => {
        expect(getEscapedCssVarName(key, doubleEscape)).toEqual(expected);
      });
    });

    it('should escape all special CSS characters', () => {
      const specialChars = ' !"#$%&\'()*+,./:;<=>?@[\\]^`{|}~';
      const result = getEscapedCssVarName(specialChars, false);
      expect(result).toContain('\\');
    });

    it('should handle double quotes specifically', () => {
      const input = 'foo"bar';
      const single = getEscapedCssVarName(input, false);
      const double = getEscapedCssVarName(input, true);
      expect(double.length).toBeGreaterThan(single.length);
    });

    it('should not escape hyphens', () => {
      const input = 'foo-bar-baz';
      expect(getEscapedCssVarName(input, false)).toBe('foo-bar-baz');
    });

    it('should not escape alphanumeric characters', () => {
      const input = 'abc123XYZ';
      expect(getEscapedCssVarName(input, false)).toBe('abc123XYZ');
    });

    it('should handle mixed content', () => {
      const input = 'my var:value';
      const result = getEscapedCssVarName(input, false);
      expect(result).toContain('\\');
      expect(result).toContain('my');
      expect(result).toContain('var');
      expect(result).toContain('value');
    });
  });
});
