import { escapeHTML, escapeHTMLComment, getEscapedCssVarName } from '../src';

describe('escapeHTML Utils', () => {
  describe('escapeHTML', () => {
    it('should escape HTML special characters', () => {
      expect(escapeHTML('<div>')).toBe('&lt;div&gt;');
      expect(escapeHTML('"quote"')).toBe('&quot;quote&quot;');
      expect(escapeHTML('&ampersand')).toBe('&amp;ampersand');
      expect(escapeHTML("'single'")).toBe('&#39;single&#39;');
    });

    it('should handle strings with multiple special characters', () => {
      expect(escapeHTML('<div class="test">&</div>')).toBe(
        '&lt;div class=&quot;test&quot;&gt;&amp;&lt;/div&gt;',
      );
    });

    it('should handle empty strings and strings without special characters', () => {
      expect(escapeHTML('')).toBe('');
      expect(escapeHTML('normal text')).toBe('normal text');
    });
  });

  describe('escapeHTMLComment', () => {
    it('should escape HTML comments', () => {
      expect(escapeHTMLComment('<!-- comment -->')).toBe(' comment ');
      expect(escapeHTMLComment('text <!-- comment --> text')).toBe('text  comment  text');
    });

    it('should handle nested comments', () => {
      expect(escapeHTMLComment('<!-- outer <!-- inner --> outer -->')).toBe(
        ' outer  inner  outer ',
      );
    });

    it('should handle empty strings and strings without comments', () => {
      expect(escapeHTMLComment('')).toBe('');
      expect(escapeHTMLComment('normal text')).toBe('normal text');
    });
  });

  describe('getEscapedCssVarName', () => {
    it('should escapeHTML CSS variable names with single escapeHTML', () => {
      expect(getEscapedCssVarName('foo bar', false)).toBe('foo\\ bar');
      expect(getEscapedCssVarName('foo@bar', false)).toBe('foo\\@bar');
      expect(getEscapedCssVarName('foo:bar', false)).toBe('foo\\:bar');
    });

    it('should escapeHTML CSS variable names with double escapeHTML', () => {
      expect(getEscapedCssVarName('foo bar', true)).toBe('foo\\\\ bar');
      expect(getEscapedCssVarName('foo@bar', true)).toBe('foo\\\\@bar');
      expect(getEscapedCssVarName('foo:bar', true)).toBe('foo\\\\:bar');
    });

    it('should handle strings without special characters', () => {
      expect(getEscapedCssVarName('foobar', false)).toBe('foobar');
      expect(getEscapedCssVarName('foo-bar', false)).toBe('foo-bar');
    });

    it('should handle empty strings', () => {
      expect(getEscapedCssVarName('', false)).toBe('');
    });
  });
});
