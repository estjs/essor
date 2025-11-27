import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeClass, patchClass } from '../../src/operations/class';

describe('classNames module', () => {
  let element: HTMLElement;
  let svgElement: SVGElement;

  beforeEach(() => {
    element = document.createElement('div');
    svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('normalizeClass function', () => {
    it('should return empty string for null or undefined', () => {
      expect(normalizeClass(null)).toBe('');
      expect(normalizeClass(undefined)).toBe('');
    });

    it('should return trimmed string for string values', () => {
      expect(normalizeClass('test')).toBe('test');
      expect(normalizeClass('  test  ')).toBe('test');
      expect(normalizeClass('')).toBe('');
    });

    it('should convert number to string', () => {
      expect(normalizeClass(123)).toBe('123');
    });

    it('should handle boolean values', () => {
      expect(normalizeClass(true)).toBe('true');
      expect(normalizeClass(false)).toBe('false');
    });

    describe('array handling', () => {
      it('should handle empty arrays', () => {
        expect(normalizeClass([])).toBe('');
      });

      it('should handle single-item arrays', () => {
        expect(normalizeClass(['test'])).toBe('test');
      });

      it('should handle arrays with multiple items', () => {
        expect(normalizeClass(['a', 'b', 'c'])).toBe('a b c');
      });

      it('should handle arrays with falsy values', () => {
        expect(normalizeClass(['a', null, 'b', undefined, 'c', ''])).toBe('a b c');
      });

      it('should handle nested arrays', () => {
        expect(normalizeClass(['a', ['b', 'c'], 'd'])).toBe('a b c d');
      });
    });

    describe('object handling', () => {
      it('should handle objects with boolean values', () => {
        const obj = { a: true, b: false, c: true };
        expect(normalizeClass(obj)).toBe('a c');
      });

      it('should handle objects with truthy/falsy values', () => {
        const obj = { a: 1, b: 0, c: '', d: 'value', e: null, f: undefined };
        expect(normalizeClass(obj)).toBe('a d');
      });

      it('should ignore non-string keys in objects', () => {
        const obj = {
          a: true,
          1: true,
          [Symbol('test')]: true,
        };

        // The exact order might differ depending on property enumeration
        const result = normalizeClass(obj);
        expect(result.includes('a')).toBe(true);
        expect(result.includes('1')).toBe(true);
        expect(result.split(' ').length).toBe(2);
      });
    });
  });

  describe('patchClass function', () => {
    it('should set class attribute on elements', () => {
      patchClass(element, null, 'test-class');
      expect(element.className).toBe('test-class');
    });

    it('should set class attribute on SVG elements', () => {
      patchClass(svgElement, true, 'test-class', true);
      expect(svgElement.getAttribute('class')).toBe('test-class');
    });

    it('should remove class attribute when class is empty string', () => {
      element.className = 'test-class';
      patchClass(element, null, '');
      expect(element.hasAttribute('class')).toBe(false);
    });

    it('should skip update if class has not changed', () => {
      patchClass(element, null, 'test-class');
      expect(element.className).toBe('test-class');

      // Mock className property setter
      const classNameSetter = vi.spyOn(element, 'className', 'set');

      // Second call with same value should be a no-op
      patchClass(element, 'test-class', 'test-class');
      expect(classNameSetter).not.toHaveBeenCalled();

      // New value should call className setter
      patchClass(element, 'test-class', 'new-class');
      expect(classNameSetter).toHaveBeenCalledWith('new-class');
    });

    it('should handle various class formats', () => {
      patchClass(element, null, { active: true, disabled: false });
      expect(element.className).toBe('active');
    });

    it('should handle null and undefined values', () => {
      patchClass(element, null, 'test-class');

      // Set a class first
      element.className = 'test-class';

      // Test null
      patchClass(element, 'test-class', null);
      expect(element.hasAttribute('class')).toBe(false);

      // Test undefined
      element.className = 'test-class';
      patchClass(element, 'test-class', undefined);
      expect(element.hasAttribute('class')).toBe(false);
    });

    it('should handle array values', () => {
      patchClass(element, null, ['a', 'b', 'c']);
      expect(element.className).toBe('a b c');
    });

    it('should handle object values', () => {
      patchClass(element, null, { active: true, disabled: false });
      expect(element.className).toBe('active');
    });
  });
});
