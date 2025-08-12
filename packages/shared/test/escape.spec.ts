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
  });

  describe('escapeHTMLComment', () => {
    const testCases = [
      { input: '<!-- comment -->', expected: ' comment ' },
      { input: 'text <!-- comment --> text', expected: 'text  comment  text' },
      { input: '<!-- outer <!-- inner --> outer -->', expected: ' outer  inner  outer ' },
      { input: '', expected: '' },
      { input: 'normal text', expected: 'normal text' },
      { input: '--!> comment', expected: ' comment' },
      { input: '<!- comment', expected: '<!- comment' }, // Changed expected value
      { input: '-> comment', expected: ' comment' },
    ];

    testCases.forEach(({ input, expected }) => {
      it(`should escapeHTML comment '${input}' to '${expected}'`, () => {
        expect(escapeHTMLComment(input)).toBe(expected);
      });
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
        expect(getEscapedCssVarName(key, doubleEscape)).toEqual(expected); // Changed toBe to toEqual
      });
    });
  });
});
