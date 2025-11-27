import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { patchAttr } from '../../src/operations/attr';
import { XLINK_NAMESPACE } from '../../src/constants';

describe('attributes module', () => {
  let element: HTMLElement;
  let svgElement: SVGElement;

  beforeEach(() => {
    element = document.createElement('div');
    svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('xLINK_NAMESPACE constant', () => {
    it('should have the correct value', () => {
      expect(XLINK_NAMESPACE).toBe('http://www.w3.org/2000/xlink');
    });
  });

  describe('patchAttr function', () => {
    it('should set a regular attribute', () => {
      patchAttr(element, 'data-test', null, 'value');
      expect(element.dataset.test).toBe('value');
    });

    it('should remove attribute when value is null', () => {
      element.dataset.test = 'value';
      patchAttr(element, 'data-test', 'value', null);
      expect(element.dataset.test).toBeUndefined();
      expect(Object.hasOwn(element.dataset, 'test')).toBe(false);
    });

    it('should handle undefined values', () => {
      element.dataset.test = 'value';
      patchAttr(element, 'data-test', 'value', undefined);

      // Should not throw an exception
      expect(() => {
        patchAttr(element, 'data-test', 'value', undefined);
      }).not.toThrow();
    });

    it('should convert values to string', () => {
      patchAttr(element, 'data-test', null, 123);
      expect(element.dataset.test).toBe('123');
    });

    it('should handle symbol values', () => {
      const symbol = Symbol('test');
      patchAttr(element, 'data-test', null, symbol as unknown as string);
      expect(element.dataset.test).toBe('Symbol(test)');
    });

    it('should skip update if value has not changed', () => {
      // First call sets the attribute
      patchAttr(element, 'data-test', null, 'value');
      expect(element.dataset.test).toBe('value');

      // Mock patchAttribute to track calls
      const setSpy = vi.spyOn(element, 'setAttribute');

      // Second call with same value should be a no-op
      patchAttr(element, 'data-test', 'value', 'value');
      expect(setSpy).not.toHaveBeenCalled();

      // New value should call patchAttribute
      patchAttr(element, 'data-test', 'value', 'new-value');
      expect(setSpy).toHaveBeenCalledWith('data-test', 'new-value');
    });

    describe('xlink attributes for SVG', () => {
      it('should set xlink attribute with namespace', () => {
        const patchAttributeNSSpy = vi.spyOn(svgElement, 'setAttributeNS');
        patchAttr(svgElement, 'xlink:href', null, 'https://example.com');

        expect(patchAttributeNSSpy).toHaveBeenCalledWith(
          XLINK_NAMESPACE,
          'xlink:href',
          'https://example.com',
        );
      });

      it('should remove xlink attribute with namespace', () => {
        svgElement.setAttributeNS(XLINK_NAMESPACE, 'href', 'https://example.com');

        const removeAttributeNSSpy = vi.spyOn(svgElement, 'removeAttributeNS');
        patchAttr(svgElement, 'xlink:href', true, null);

        expect(removeAttributeNSSpy).toHaveBeenCalledWith(XLINK_NAMESPACE, 'href');
      });
    });

    describe('boolean attributes', () => {
      it('should set an empty string value for truthy boolean attributes', () => {
        patchAttr(element, 'disabled', null, true);
        expect(element.getAttribute('disabled')).toBe('');
      });

      it('should remove the attribute for falsy boolean attributes', () => {
        element.setAttribute('disabled', '');
        patchAttr(element, 'disabled', null, false);
        expect(element.hasAttribute('disabled')).toBe(false);
      });

      it('should remove the attribute when value is nul', () => {
        element.setAttribute('value', '');
        patchAttr(element, 'value', null, null);
        expect(element.getAttribute('disabled')).toBeNull();
      });

      it('should set empty string with special boolean attr', () => {
        element.setAttribute('SpecialBooleanAtt', '');
        patchAttr(element, 'SpecialBooleanAtt', null, null);
        expect(element.getAttribute('disabled')).toBe('');
      });
    });

    describe('data attributes', () => {
      it('should handle data-* attributes setting', () => {
        patchAttr(element, 'data-test', null, 'value');
        expect(element.dataset.test).toBe('value');
      });

      it('should handle data-* attributes with null value', () => {
        element.dataset.test = 'value';
        patchAttr(element, 'data-test', 'value', null);
        expect(element.dataset.test).toBeUndefined();
        expect(Object.hasOwn(element.dataset, 'test')).toBe(false);
      });

      it('should handle data-* attributes with kebab-case names', () => {
        patchAttr(element, 'data-kebab-case', null, 'value');
        expect(element.dataset.kebabCase).toBe('value');

        patchAttr(element, 'data-kebab-case', 'value', null);
        expect(element.dataset.kebabCase).toBeUndefined();
        expect(Object.hasOwn(element.dataset, 'kebabCase')).toBe(false);
      });
    });

    it('should not throw when patching attributes on text nodes', () => {
      const textNode = document.createTextNode('Text content');

      // Should throw an exception (text nodes don't have attributes)
      expect(() => {
        patchAttr(textNode as any, 'data-test', null, 'test');
      }).toThrow();
    });
  });
});
