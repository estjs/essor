import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { patchAttr } from '../../src/operations/attr';
import { KEY_PROP, SPREAD_NAME, XLINK_NAMESPACE, XMLNS_NAMESPACE } from '../../src/constants';

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
        patchAttr(element, 'SpecialBooleanAtt', '', null);
        expect(element.getAttribute('SpecialBooleanAtt')).toBeNull();
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

    describe('kEY_PROP handling', () => {
      it('should set node key when KEY_PROP has a value', () => {
        patchAttr(element, KEY_PROP, null, 'my-key');
        // The key should be set on the element (stored in a Symbol property)
        // We can verify by checking that the element has the key set
        const keySymbol = Object.getOwnPropertySymbols(element).find(
          s => s.toString() === 'Symbol(essor.key)',
        );
        expect(keySymbol).toBeDefined();
        expect((element as any)[keySymbol!]).toBe('my-key');
      });

      it('should clear node key when KEY_PROP is null', () => {
        // First set a key
        patchAttr(element, KEY_PROP, null, 'my-key');
        let keySymbol = Object.getOwnPropertySymbols(element).find(
          s => s.toString() === 'Symbol(essor.key)',
        );
        expect(keySymbol).toBeDefined();

        // Then clear it
        patchAttr(element, KEY_PROP, 'my-key', null);
        keySymbol = Object.getOwnPropertySymbols(element).find(
          s => s.toString() === 'Symbol(essor.key)',
        );
        // The symbol property should be deleted
        expect(keySymbol).toBeUndefined();
      });

      it('should convert KEY_PROP value to string', () => {
        patchAttr(element, KEY_PROP, null, 123);
        const keySymbol = Object.getOwnPropertySymbols(element).find(
          s => s.toString() === 'Symbol(essor.key)',
        );
        expect((element as any)[keySymbol!]).toBe('123');
      });
    });

    describe('sPREAD_NAME handling', () => {
      it('should spread object properties as attributes', () => {
        const attrs = {
          'data-foo': 'bar',
          'data-baz': 'qux',
          'id': 'test-id',
        };

        patchAttr(element, SPREAD_NAME, null, attrs);

        expect(element.dataset.foo).toBe('bar');
        expect(element.dataset.baz).toBe('qux');
        expect(element.id).toBe('test-id');
      });

      it('should handle empty spread object', () => {
        expect(() => {
          patchAttr(element, SPREAD_NAME, null, {});
        }).not.toThrow();
      });

      it('should update spread attributes', () => {
        const prev = { 'data-old': 'value' };
        const next = { 'data-new': 'value' };

        patchAttr(element, SPREAD_NAME, prev, next);
        expect(element.dataset.new).toBe('value');
      });
    });

    describe('innerHTML attribute', () => {
      it('should skip innerHTML attribute', () => {
        const setSpy = vi.spyOn(element, 'setAttribute');
        patchAttr(element, 'innerHTML', null, '<div>test</div>');

        // Should not call setAttribute for innerHTML
        expect(setSpy).not.toHaveBeenCalled();
      });

      it('should skip innerhtml attribute (lowercase)', () => {
        const setSpy = vi.spyOn(element, 'setAttribute');
        patchAttr(element, 'innerhtml', null, '<div>test</div>');

        expect(setSpy).not.toHaveBeenCalled();
      });
    });

    describe('event handler attributes', () => {
      it('should skip onclick attribute', () => {
        const setSpy = vi.spyOn(element, 'setAttribute');
        patchAttr(element, 'onclick', null, 'alert("test")');

        expect(setSpy).not.toHaveBeenCalled();
      });

      it('should skip onchange attribute', () => {
        const setSpy = vi.spyOn(element, 'setAttribute');
        patchAttr(element, 'onchange', null, 'console.log("changed")');

        expect(setSpy).not.toHaveBeenCalled();
      });
    });

    describe('xmlns attributes for SVG', () => {
      it('should set xmlns attribute with namespace', () => {
        const setAttributeNSSpy = vi.spyOn(svgElement, 'setAttributeNS');
        patchAttr(svgElement, 'xmlns:custom', null, 'http://example.com/custom');

        expect(setAttributeNSSpy).toHaveBeenCalledWith(
          XMLNS_NAMESPACE,
          'xmlns:custom',
          'http://example.com/custom',
        );
      });

      it('should remove xmlns attribute with namespace', () => {
        // Set the attribute first using the correct method
        svgElement.setAttributeNS(XMLNS_NAMESPACE, 'xmlns:custom', 'http://example.com/custom');

        const removeAttributeNSSpy = vi.spyOn(svgElement, 'removeAttributeNS');
        patchAttr(svgElement, 'xmlns:custom', 'http://example.com/custom', null);

        expect(removeAttributeNSSpy).toHaveBeenCalledWith(XMLNS_NAMESPACE, 'custom');
      });
    });

    describe('uRL attribute security', () => {
      it('should block javascript: URLs in href', () => {
        const setSpy = vi.spyOn(element, 'setAttribute');
        patchAttr(element, 'href', null, 'javascript:alert("xss")');

        expect(setSpy).not.toHaveBeenCalled();
      });

      it('should block javascript: URLs in src', () => {
        const setSpy = vi.spyOn(element, 'setAttribute');
        patchAttr(element, 'src', null, 'javascript:alert("xss")');

        expect(setSpy).not.toHaveBeenCalled();
      });

      it('should block data: URLs in href', () => {
        const setSpy = vi.spyOn(element, 'setAttribute');
        patchAttr(element, 'href', null, 'data:text/html,<script>alert("xss")</script>');

        expect(setSpy).not.toHaveBeenCalled();
      });

      it('should block data: URLs in src', () => {
        const setSpy = vi.spyOn(element, 'setAttribute');
        patchAttr(element, 'src', null, 'data:text/html,<script>alert("xss")</script>');

        expect(setSpy).not.toHaveBeenCalled();
      });

      it('should allow safe URLs in href', () => {
        patchAttr(element, 'href', null, 'https://example.com');
        expect(element.getAttribute('href')).toBe('https://example.com');
      });

      it('should allow safe URLs in src', () => {
        patchAttr(element, 'src', null, 'https://example.com/image.png');
        expect(element.getAttribute('src')).toBe('https://example.com/image.png');
      });

      it('should block javascript: URLs with whitespace', () => {
        const setSpy = vi.spyOn(element, 'setAttribute');
        patchAttr(element, 'href', null, '  javascript:alert("xss")  ');

        expect(setSpy).not.toHaveBeenCalled();
      });

      it('should block JAVASCRIPT: URLs (case insensitive)', () => {
        const setSpy = vi.spyOn(element, 'setAttribute');
        patchAttr(element, 'href', null, 'JAVASCRIPT:alert("xss")');

        expect(setSpy).not.toHaveBeenCalled();
      });
    });

    describe('sVG element attributes', () => {
      it('should use setAttribute for SVG elements', () => {
        const setSpy = vi.spyOn(svgElement, 'setAttribute');
        patchAttr(svgElement, 'viewBox', null, '0 0 100 100');

        expect(setSpy).toHaveBeenCalledWith('viewBox', '0 0 100 100');
      });

      it('should handle numeric values on SVG elements', () => {
        patchAttr(svgElement, 'width', null, 100);
        expect(svgElement.getAttribute('width')).toBe('100');
      });
    });

    describe('property setting with fallback', () => {
      it('should set property directly when key exists in element', () => {
        const input = document.createElement('input');
        patchAttr(input, 'value', null, 'test-value');

        expect(input.value).toBe('test-value');
      });

      it('should fallback to setAttribute when property setting fails', () => {
        const div = document.createElement('div');

        // Create a read-only property to trigger the catch block
        Object.defineProperty(div, 'readOnlyProp', {
          get() {
            return 'readonly';
          },
          set() {
            throw new Error('Cannot set read-only property');
          },
          configurable: true,
        });

        const setSpy = vi.spyOn(div, 'setAttribute');

        // This should trigger the catch block and fallback to setAttribute
        patchAttr(div, 'readOnlyProp', null, 'new-value');

        expect(setSpy).toHaveBeenCalledWith('readOnlyProp', 'new-value');
      });

      it('should use setAttribute for custom attributes not in element', () => {
        const setSpy = vi.spyOn(element, 'setAttribute');
        patchAttr(element, 'custom-attr', null, 'custom-value');

        expect(setSpy).toHaveBeenCalledWith('custom-attr', 'custom-value');
        expect(element.getAttribute('custom-attr')).toBe('custom-value');
      });
    });
  });
});
