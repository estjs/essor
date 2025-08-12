import { describe, expect, it, vi } from 'vitest';
import {
  includeBooleanAttr,
  isBooleanAttr,
  isHTMLTag,
  isKnownHtmlAttr,
  isKnownSvgAttr,
  isMathMLTag,
  isRenderAbleAttrValue,
  isSSRSafeAttrName,
  isSVGTag,
  isSelfClosingTag,
  isSpecialBooleanAttr,
  isVoidTag,
  makeMap,
  propsToAttrMap,
} from '../src/dom';

describe('dom utilities', () => {
  describe('makeMap', () => {
    const testCases = [
      { input: 'a,b,c', key: 'a', expected: true },
      { input: 'a,b,c', key: 'b', expected: true },
      { input: 'a,b,c', key: 'c', expected: true },
      { input: 'a,b,c', key: 'd', expected: false },
      { input: '', key: 'a', expected: false },
      { input: 'a, b, c', key: 'a', expected: true },
      { input: 'a, b, c', key: ' b', expected: true },
      { input: 'a, b, c', key: ' c', expected: true },
      { input: 'a, b, c', key: 'b', expected: false },
      { input: 'a, b, c', key: 'c', expected: false },
    ];

    testCases.forEach(({ input, key, expected }) => {
      it(`should return ${expected} for key '${key}' in map from '${input}'`, () => {
        const map = makeMap(input);
        expect(map(key)).toBe(expected);
      });
    });
  });

  describe('boolean attributes', () => {
    const specialBooleanAttrs = [
      'itemscope',
      'allowfullscreen',
      'formnovalidate',
      'ismap',
      'nomodule',
      'novalidate',
      'readonly',
    ];
    const booleanAttrs = [
      ...specialBooleanAttrs,
      'disabled',
      'checked',
      'selected',
      'hidden',
      'multiple',
    ];
    const nonBooleanAttrs = ['class', 'style', 'id'];

    it('isSpecialBooleanAttr should identify special boolean attributes', () => {
      specialBooleanAttrs.forEach(attr => {
        expect(isSpecialBooleanAttr(attr)).toBe(true);
      });
      expect(isSpecialBooleanAttr('disabled')).toBe(false);
    });

    it('isBooleanAttr should identify all boolean attributes', () => {
      booleanAttrs.forEach(attr => {
        expect(isBooleanAttr(attr)).toBe(true);
      });
      nonBooleanAttrs.forEach(attr => {
        expect(isBooleanAttr(attr)).toBe(false);
      });
    });

    it('includeBooleanAttr should determine if boolean attribute should be included', () => {
      expect(includeBooleanAttr(true)).toBe(true);
      expect(includeBooleanAttr('true')).toBe(true);
      expect(includeBooleanAttr('')).toBe(true);
      expect(includeBooleanAttr(1)).toBe(true);

      expect(includeBooleanAttr(false)).toBe(false);
      expect(includeBooleanAttr(null)).toBe(false);
      expect(includeBooleanAttr(undefined)).toBe(false);
      expect(includeBooleanAttr(0)).toBe(false);
    });
  });

  describe('isSSRSafeAttrName', () => {
    const safeAttrs = ['class', 'id', 'data-test'];
    const unsafeAttrs = [
      'foo"bar',
      'foo>bar',
      'foo/bar',
      "foo'bar",
      'foo bar',
      'foo\nbar',
      'foo\tbar',
    ];

    it('should identify safe attribute names', () => {
      safeAttrs.forEach(attr => {
        expect(isSSRSafeAttrName(attr)).toBe(true);
      });
    });

    it('should identify unsafe attribute names', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      unsafeAttrs.forEach(attr => {
        expect(isSSRSafeAttrName(attr)).toBe(false);
        expect(consoleSpy).toHaveBeenCalledWith(`unsafe attribute name: ${attr}`);
      });

      consoleSpy.mockRestore();
    });

    it('should cache validation results', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const unsafeAttrName = `foo"bar-${Date.now()}`;

      expect(isSSRSafeAttrName(unsafeAttrName)).toBe(false);
      expect(consoleSpy).toHaveBeenCalledTimes(1);

      expect(isSSRSafeAttrName(unsafeAttrName)).toBe(false);
      expect(consoleSpy).toHaveBeenCalledTimes(1);

      consoleSpy.mockRestore();
    });
  });

  describe('propsToAttrMap', () => {
    it('should map React-style props to HTML attributes', () => {
      expect(propsToAttrMap.acceptCharset).toBe('accept-charset');
      expect(propsToAttrMap.className).toBe('class');
      expect(propsToAttrMap.htmlFor).toBe('for');
      expect(propsToAttrMap.httpEquiv).toBe('http-equiv');
    });
  });

  describe('attribute and tag checks', () => {
    const knownHtmlAttrs = ['class', 'id', 'style', 'src', 'href'];
    const knownSvgAttrs = ['xmlns', 'viewBox', 'fill', 'stroke', 'd'];
    const htmlTags = ['div', 'span', 'p', 'a', 'img'];
    const svgTags = ['svg', 'path', 'circle', 'rect'];
    const mathmlTags = ['math', 'mfrac', 'msqrt'];
    const voidTags = ['img', 'input', 'br', 'hr'];
    const selfClosingTags = ['img', 'input', 'br', 'hr'];

    it('isKnownHtmlAttr', () => {
      knownHtmlAttrs.forEach(attr => {
        expect(isKnownHtmlAttr(attr)).toBe(true);
      });
      expect(isKnownHtmlAttr('nonexistent')).toBe(false);
    });

    it('isKnownSvgAttr', () => {
      knownSvgAttrs.forEach(attr => {
        expect(isKnownSvgAttr(attr)).toBe(true);
      });
      expect(isKnownSvgAttr('nonexistent')).toBe(false);
    });

    it('isHTMLTag', () => {
      htmlTags.forEach(tag => {
        expect(isHTMLTag(tag)).toBe(true);
      });
      expect(isHTMLTag('svg')).toBe(false);
    });

    it('isSVGTag', () => {
      svgTags.forEach(tag => {
        expect(isSVGTag(tag)).toBe(true);
      });
      expect(isSVGTag('div')).toBe(false);
    });

    it('isMathMLTag', () => {
      mathmlTags.forEach(tag => {
        expect(isMathMLTag(tag)).toBe(true);
      });
      expect(isMathMLTag('div')).toBe(false);
    });

    it('isVoidTag', () => {
      voidTags.forEach(tag => {
        expect(isVoidTag(tag)).toBe(true);
      });
      expect(isVoidTag('div')).toBe(false);
    });

    it('isSelfClosingTag', () => {
      selfClosingTags.forEach(tag => {
        expect(isSelfClosingTag(tag)).toBe(true);
      });
      expect(isSelfClosingTag('div')).toBe(false);
    });
  });

  describe('isRenderAbleAttrValue', () => {
    const renderableValues = ['string', 42, true, false];
    const nonRenderableValues = [null, undefined, {}, [], () => {}];

    it('should identify renderable attribute values', () => {
      renderableValues.forEach(value => {
        expect(isRenderAbleAttrValue(value)).toBe(true);
      });
    });

    it('should identify non-renderable attribute values', () => {
      nonRenderableValues.forEach(value => {
        expect(isRenderAbleAttrValue(value)).toBe(false);
      });
    });
  });
});
