import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { patchAttr } from '../../src/operations/attr';
import { SPREAD_NAME, XLINK_NAMESPACE, XMLNS_NAMESPACE } from '../../src/constants';

const CLIENT_URL_ATTRIBUTES = [
  {
    name: 'href',
    create: () => document.createElement('a'),
    read: (element: Element) => element.getAttribute('href'),
  },
  {
    name: 'SRC',
    create: () => document.createElement('img'),
    read: (element: Element) => element.getAttribute('src'),
  },
  {
    name: 'xlink:href',
    create: () => document.createElementNS('http://www.w3.org/2000/svg', 'use'),
    read: (element: Element) => element.getAttributeNS(XLINK_NAMESPACE, 'href'),
  },
  {
    name: 'ACTION',
    create: () => document.createElement('form'),
    read: (element: Element) => element.getAttribute('action'),
  },
  {
    name: 'formAction',
    create: () => document.createElement('button'),
    read: (element: Element) => element.getAttribute('formaction'),
  },
  {
    name: 'PoStEr',
    create: () => document.createElement('video'),
    read: (element: Element) => element.getAttribute('poster'),
  },
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
      patchAttr(element, 'data-test', null, symbol);
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

      it('routes mixed-case xlink URL attributes through the xlink namespace', () => {
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');

        patchAttr(use, 'XLink:Href', null, '#safe-symbol');
        expect.soft(use.getAttributeNS(XLINK_NAMESPACE, 'href')).toBe('#safe-symbol');

        const unsafeUrl = 'javascript:alert(1)';
        use.setAttributeNS(XLINK_NAMESPACE, 'xlink:href', unsafeUrl);
        patchAttr(use, 'XLink:Href', unsafeUrl, unsafeUrl);

        expect(use.getAttributeNS(XLINK_NAMESPACE, 'href')).toBeNull();
      });

      it('canonicalizes mixed-case SVG URL names without changing non-URL attribute casing', () => {
        const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');

        patchAttr(image, 'HREF', null, '/safe.svg');
        patchAttr(image, 'viewBox', null, '0 0 10 10');

        expect.soft(image.getAttribute('href')).toBe('/safe.svg');
        expect.soft(image.getAttribute('HREF')).toBeNull();
        expect.soft(image.getAttribute('viewBox')).toBe('0 0 10 10');
        expect.soft(image.getAttribute('viewbox')).toBeNull();

        const unsafeUrl = 'javascript:alert(1)';
        image.setAttribute('href', unsafeUrl);
        patchAttr(image, 'HREF', unsafeUrl, unsafeUrl);

        expect(image.getAttribute('href')).toBeNull();
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

      it('should sync boolean attributes to form control properties', () => {
        const input = document.createElement('input');
        input.type = 'checkbox';

        input.checked = false;
        patchAttr(input, 'checked', null, true);
        expect(input.hasAttribute('checked')).toBe(true);
        expect(input.checked).toBe(true);

        input.checked = true;
        patchAttr(input, 'checked', true, false);
        expect(input.hasAttribute('checked')).toBe(false);
        expect(input.checked).toBe(false);
      });

      it('should clear property-only boolean form state when removed', () => {
        const input = document.createElement('input');
        input.type = 'checkbox';

        input.indeterminate = true;
        patchAttr(input, 'indeterminate', true, null);

        expect(input.indeterminate).toBe(false);
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
      it.each(CLIENT_URL_ATTRIBUTES)(
        'drops unsafe URL values for $name',
        ({ create, name, read }) => {
          for (const [, value] of UNSAFE_URLS) {
            const element = create();
            patchAttr(element, name, null, value);
            expect(read(element)).toBeNull();
          }
        },
      );

      it.each(CLIENT_URL_ATTRIBUTES)(
        'preserves safe URL values for $name',
        ({ create, name, read }) => {
          for (const value of SAFE_URLS) {
            const element = create();
            patchAttr(element, name, null, value);
            expect(read(element)).toBe(value);
          }
        },
      );

      it('removes a namespaced URL attribute when an update becomes unsafe', () => {
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');

        patchAttr(use, 'xlink:href', null, '#safe-symbol');
        patchAttr(use, 'xlink:href', '#safe-symbol', 'java\u007Fscript:alert(1)');

        expect(use.getAttributeNS(XLINK_NAMESPACE, 'href')).toBeNull();
      });

      it('removes an existing unsafe URL even when patch values are unchanged', () => {
        const anchor = document.createElement('a');
        const unsafeUrl = 'javascript:alert(1)';
        anchor.setAttribute('href', unsafeUrl);

        patchAttr(anchor, 'href', unsafeUrl, unsafeUrl);

        expect(anchor.getAttribute('href')).toBeNull();
      });

      it.each(COERCIBLE_UNSAFE_URLS)('drops unsafe URL values from %s', (_, value) => {
        const anchor = document.createElement('a');

        patchAttr(anchor, 'href', null, value);

        expect(anchor.getAttribute('href')).toBeNull();
      });

      it('coerces a URL value once and writes the checked string', () => {
        const anchor = document.createElement('a');
        let calls = 0;
        const value = {
          toString() {
            calls += 1;
            return calls === 1 ? '/safe' : 'javascript:alert(1)';
          },
        };

        patchAttr(anchor, 'href', null, value);

        expect(anchor.getAttribute('href')).toBe('/safe');
        expect(calls).toBe(1);
      });

      it('safely stringifies symbols in URL attributes', () => {
        const anchor = document.createElement('a');

        patchAttr(anchor, 'href', null, Symbol('safe'));

        expect(anchor.getAttribute('href')).toBe('Symbol(safe)');
      });

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

      it('should block dangerous data: MIME types (markup/script payloads)', () => {
        const image = document.createElement('img');
        const anchor = document.createElement('a');

        patchAttr(image, 'src', null, 'data:text/html,<svg/onload=1>');
        expect(image.getAttribute('src')).toBeNull();

        patchAttr(anchor, 'href', null, 'data:image/svg+xml,<svg onload="alert(1)"/>');
        expect(anchor.getAttribute('href')).toBeNull();

        patchAttr(anchor, 'href', null, 'data:application/xhtml+xml,<html/>');
        expect(anchor.getAttribute('href')).toBeNull();

        patchAttr(anchor, 'href', null, 'data:text/xml,<x/>');
        expect(anchor.getAttribute('href')).toBeNull();
      });

      it('should allow safe data: URLs (inline images, fonts, media)', () => {
        const image = document.createElement('img');
        const pngUrl =
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
        patchAttr(image, 'src', null, pngUrl);
        expect(image.getAttribute('src')).toBe(pngUrl);

        const link = document.createElement('a');
        const gifUrl = 'data:image/gif;base64,R0lGODlhAQABAAAAAC4=';
        patchAttr(link, 'href', null, gifUrl);
        expect(link.getAttribute('href')).toBe(gifUrl);

        // data:image/svg+xml is intentionally NOT here — it is treated as dangerous.
        const fontImg = document.createElement('img');
        const fontUrl = 'data:font/woff2;base64,d09GMgABAAAAAAA';
        patchAttr(fontImg, 'src', null, fontUrl);
        expect(fontImg.getAttribute('src')).toBe(fontUrl);
      });

      it('should allow ordinary http(s)/relative/mailto URLs', () => {
        const anchor = document.createElement('a');

        patchAttr(anchor, 'href', null, 'https://example.com/path?q=1');
        expect(anchor.getAttribute('href')).toBe('https://example.com/path?q=1');

        patchAttr(anchor, 'href', 'https://example.com/path?q=1', '/local/page');
        expect(anchor.getAttribute('href')).toBe('/local/page');

        patchAttr(anchor, 'href', '/local/page', 'mailto:a@b.com');
        expect(anchor.getAttribute('href')).toBe('mailto:a@b.com');
      });

      it('should block obfuscated javascript: protocols with embedded control chars', () => {
        const anchor = document.createElement('a');

        // Tab inside the protocol — browsers ignore it, so must we.
        patchAttr(anchor, 'href', null, 'java\tscript:alert(1)');
        expect(anchor.getAttribute('href')).toBeNull();

        // Leading newline / spaces before the protocol.
        patchAttr(anchor, 'href', null, '\n  javascript:alert(1)');
        expect(anchor.getAttribute('href')).toBeNull();

        // Uppercase variants.
        patchAttr(anchor, 'href', null, 'JaVaScRiPt:alert(1)');
        expect(anchor.getAttribute('href')).toBeNull();
      });

      it('should block vbscript: protocol', () => {
        const anchor = document.createElement('a');
        patchAttr(anchor, 'href', null, 'vbscript:msgbox(1)');
        expect(anchor.getAttribute('href')).toBeNull();
      });

      it('should ignore event attributes because the event layer handles them', () => {
        const setSpy = vi.spyOn(element, 'setAttribute');

        patchAttr(element, 'onClick', null, 'alert(1)');

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

      it('should remove the old spread listener when onClick changes to a non-function', () => {
        // Regression: with the old `next == null && isFunction(prev)` guard, a
        // function → string transition skipped the event branch entirely and
        // the stale listener kept firing.
        const handler = vi.fn();
        const prev = { onClick: handler };
        const next = { onClick: 'not-a-function' };

        patchAttr(element, SPREAD_NAME, null, prev);
        element.dispatchEvent(new Event('click'));
        expect(handler).toHaveBeenCalledTimes(1);

        patchAttr(element, SPREAD_NAME, prev, next);
        element.dispatchEvent(new Event('click'));
        expect(handler).toHaveBeenCalledTimes(1);
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
