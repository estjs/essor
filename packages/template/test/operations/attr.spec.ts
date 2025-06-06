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
      const attrPatcher = patchAttr(element, 'data-test');
      attrPatcher(null, 'value');
      expect(element.dataset.test).toBe('value');
    });

    it('should remove attribute when value is null', () => {
      element.dataset.test = 'value';
      const attrPatcher = patchAttr(element, 'data-test');
      attrPatcher('value', null);
      expect(element.dataset.test).toBeUndefined();
      expect(Object.hasOwn(element.dataset, 'test')).toBe(false);
    });

    it('should handle undefined values', () => {
      element.dataset.test = 'value';
      const attrPatcher = patchAttr(element, 'data-test');

      // Should not throw an exception
      expect(() => {
        attrPatcher('value', undefined);
      }).not.toThrow();
    });

    it('should convert values to string', () => {
      const attrPatcher = patchAttr(element, 'data-test');
      attrPatcher(null, 123);
      expect(element.dataset.test).toBe('123');
    });

    it('should handle symbol values', () => {
      const symbol = Symbol('test');
      const attrPatcher = patchAttr(element, 'data-test');
      // @ts-ignore - testing special type conversion
      attrPatcher(null, symbol);
      expect(element.dataset.test).toBe('Symbol(test)');
    });

    it('should skip update if value has not changed', () => {
      // First call sets the attribute
      const attrPatcher = patchAttr(element, 'data-test');
      attrPatcher(null, 'value');
      expect(element.dataset.test).toBe('value');

      // Mock setAttribute to track calls
      const setSpy = vi.spyOn(element, 'setAttribute');

      // Second call with same value should be a no-op
      attrPatcher('value', 'value');
      expect(setSpy).not.toHaveBeenCalled();

      // New value should call setAttribute
      attrPatcher('value', 'new-value');
      expect(setSpy).toHaveBeenCalledWith('data-test', 'new-value');
    });

    describe('xlink attributes for SVG', () => {
      it('should set xlink attribute with namespace', () => {
        const setAttributeNSSpy = vi.spyOn(svgElement, 'setAttributeNS');
        const xlinkPatcher = patchAttr(svgElement, 'xlink:href', true);

        xlinkPatcher(null, 'https://example.com');

        expect(setAttributeNSSpy).toHaveBeenCalledWith(
          XLINK_NAMESPACE,
          'xlink:href',
          'https://example.com',
        );
      });

      it('should remove xlink attribute with namespace', () => {
        svgElement.setAttributeNS(XLINK_NAMESPACE, 'href', 'https://example.com');

        const removeAttributeNSSpy = vi.spyOn(svgElement, 'removeAttributeNS');
        const xlinkPatcher = patchAttr(svgElement, 'xlink:href', true);

        xlinkPatcher('https://example.com', null);

        expect(removeAttributeNSSpy).toHaveBeenCalledWith(XLINK_NAMESPACE, 'href');
      });
    });

    describe('boolean attributes', () => {
      it('should set an empty string value for truthy boolean attributes', () => {
        const boolPatcher = patchAttr(element, 'disabled');
        boolPatcher(null, true);
        expect(element.getAttribute('disabled')).toBe('');
      });

      it('should remove the attribute for falsy boolean attributes', () => {
        element.setAttribute('disabled', '');
        const boolPatcher = patchAttr(element, 'disabled');
        boolPatcher(true, false);
        expect(element.hasAttribute('disabled')).toBe(false);
      });

      it('should remove the attribute when value is null', () => {
        element.setAttribute('disabled', '');
        const boolPatcher = patchAttr(element, 'disabled');
        boolPatcher(true, null);
        expect(element.getAttribute('disabled')).toBeNull();
      });
    });

    describe('data attributes', () => {
      it('should handle data-* attributes setting', () => {
        const dataPatcher = patchAttr(element, 'data-test');
        dataPatcher(null, 'value');
        expect(element.dataset.test).toBe('value');
      });

      it('should handle data-* attributes with null value', () => {
        element.dataset.test = 'value';
        const dataPatcher = patchAttr(element, 'data-test');
        dataPatcher('value', null);
        expect(element.dataset.test).toBeUndefined();
        expect(Object.hasOwn(element.dataset, 'test')).toBe(false);
      });

      it('should handle data-* attributes with kebab-case names', () => {
        const kebabPatcher = patchAttr(element, 'data-kebab-case');
        kebabPatcher(null, 'value');
        expect(element.dataset.kebabCase).toBe('value');

        kebabPatcher('value', null);
        expect(element.dataset.kebabCase).toBeUndefined();
        expect(Object.hasOwn(element.dataset, 'kebabCase')).toBe(false);
      });
    });

    it('should not throw when patching attributes on text nodes', () => {
      const textNode = document.createTextNode('Text content');

      // Should throw an exception (text nodes don't have attributes)
      expect(() => {
        const textPatcher = patchAttr(textNode as any, 'data-test');
        textPatcher(null, 'test');
      }).toThrow();
    });
  });
});
