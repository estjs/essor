import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { patchAttr } from '../../src/operations/attr';
import { SPREAD_NAME, XLINK_NAMESPACE, XMLNS_NAMESPACE } from '../../src/constants';

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

      it('should block dangerous protocols on xlink:href', () => {
        patchAttr(svgElement, 'xlink:href', null, 'javascript:alert(1)');
        expect(svgElement.getAttribute('xlink:href')).toBeNull();
      });

      it('should set and remove xmlns attributes with the XMLNS namespace', () => {
        const setSpy = vi.spyOn(svgElement, 'setAttributeNS');
        const removeSpy = vi.spyOn(svgElement, 'removeAttributeNS');

        patchAttr(svgElement, 'xmlns:xlink', null, 'https://www.w3.org/1999/xlink');
        patchAttr(svgElement, 'xmlns:xlink', 'https://www.w3.org/1999/xlink', null);

        expect(setSpy).toHaveBeenCalledWith(
          XMLNS_NAMESPACE,
          'xmlns:xlink',
          'https://www.w3.org/1999/xlink',
        );
        expect(removeSpy).toHaveBeenCalledWith(XMLNS_NAMESPACE, 'xlink');
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

    describe('dangerous sinks', () => {
      it('should block dangerous protocols on common URL attributes', () => {
        const anchor = document.createElement('a');
        const image = document.createElement('img');
        const form = document.createElement('form');
        const button = document.createElement('button');
        const video = document.createElement('video');

        patchAttr(anchor, 'href', null, 'javascript:alert(1)');
        patchAttr(image, 'src', null, 'data:text/html,<svg/onload=1>');
        patchAttr(form, 'action', null, 'javascript:alert(1)');
        patchAttr(button, 'formAction', null, 'data:text/html,<svg/onload=1>');
        patchAttr(video, 'poster', null, 'javascript:alert(1)');

        expect(anchor.getAttribute('href')).toBeNull();
        expect(image.getAttribute('src')).toBeNull();
        expect(form.getAttribute('action')).toBeNull();
        expect(button.getAttribute('formaction')).toBeNull();
        expect(video.getAttribute('poster')).toBeNull();
      });

      it('should ignore srcdoc updates', () => {
        const iframe = document.createElement('iframe');

        patchAttr(iframe, 'srcdoc', null, '<script>alert(1)</script>');

        expect(iframe.getAttribute('srcdoc')).toBeNull();
      });

      it('should ignore event attributes because the event layer handles them', () => {
        const setSpy = vi.spyOn(element, 'setAttribute');

        patchAttr(element, 'onClick', null, 'alert(1)' as unknown as string);

        expect(setSpy).not.toHaveBeenCalled();
        expect(element.hasAttribute('onClick')).toBe(false);
      });
    });

    describe('spread attributes', () => {
      it('should diff spread attributes and remove stale keys', () => {
        const prev = {
          'id': 'before',
          'data-role': 'card',
        };
        const next = {
          'title': 'after',
          'data-role': 'panel',
        };

        patchAttr(element, SPREAD_NAME, null, prev);
        patchAttr(element, SPREAD_NAME, prev, next);

        expect(element.hasAttribute('id')).toBe(false);
        expect(element.dataset.role).toBe('panel');
        expect(element.title).toBe('after');
      });

      it('should warn and ignore nested spread attributes', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        patchAttr(element, SPREAD_NAME, null, {
          [SPREAD_NAME]: { id: 'nested' },
          title: 'visible',
        });

        expect(element.title).toBe('visible');
        expect(element.id).toBe('');
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Essor warn]: nested spread attributes are ignored'),
        );
      });
    });

    describe('property assignment fallbacks', () => {
      it('should fall back to setAttribute when direct property assignment throws', () => {
        const input = document.createElement('input');
        const setSpy = vi.spyOn(input, 'setAttribute');

        Object.defineProperty(input, 'value', {
          configurable: true,
          get() {
            return '';
          },
          set() {
            throw new Error('readonly');
          },
        });

        patchAttr(input, 'value', null, 'next');

        expect(setSpy).toHaveBeenCalledWith('value', 'next');
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
