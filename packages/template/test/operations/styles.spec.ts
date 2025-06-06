import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { patchStyle, setStyle } from '../../src/operations/styles';

describe('styles module', () => {
  let element: HTMLElement;

  beforeEach(() => {
    element = document.createElement('div');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setStyle function', () => {
    it('should set a single style property', () => {
      setStyle(element.style, 'color', 'red');
      expect(element.style.color).toBe('red');
    });

    it('should handle array of values', () => {
      setStyle(element.style, 'display', ['flex', '-webkit-flex']);
      // The actual value depends on the browser/jsdom implementation
      expect(element.style.display).not.toBe('');
    });

    it('should convert null/undefined to empty string', () => {
      // @ts-ignore - testing edge cases
      setStyle(element.style, 'color', null);
      expect(element.style.color).toBe('');

      // @ts-ignore - testing edge cases
      setStyle(element.style, 'margin', undefined);
      expect(element.style.margin).toBe('');
    });

    it('should handle CSS custom properties', () => {
      const setPropertySpy = vi.spyOn(element.style, 'setProperty');

      setStyle(element.style, '--custom-color', 'blue');

      expect(setPropertySpy).toHaveBeenCalledWith('--custom-color', 'blue');
    });

    it('should handle !important declarations', () => {
      const setPropertySpy = vi.spyOn(element.style, 'setProperty');

      setStyle(element.style, 'color', 'red !important');

      expect(setPropertySpy).toHaveBeenCalledWith('color', 'red', 'important');
    });
  });

  describe('patchStyle function', () => {
    it('should set styles with object values', () => {
      const stylePatcher = patchStyle(element);
      const styles = { color: 'red', fontSize: '16px' };
      stylePatcher(null, styles);

      expect(element.style.color).toBe('red');
      expect(element.style.fontSize).toBe('16px');
    });

    it('should set styles with string values', () => {
      const stylePatcher = patchStyle(element);
      const cssText = 'color: red; font-size: 16px;';
      stylePatcher(null, cssText);

      expect(element.style.cssText).toBe(cssText);
    });

    it('should remove styles that are no longer present', () => {
      const stylePatcher = patchStyle(element);

      // First add multiple styles
      const initialStyles = { color: 'red', fontSize: '16px', margin: '10px' };
      stylePatcher(null, initialStyles);

      // Then update with a subset of styles
      const updatedStyles = { color: 'blue', margin: '5px' };
      stylePatcher(initialStyles, updatedStyles);

      // Check if removed styles are cleared
      expect(element.style.color).toBe('blue');
      expect(element.style.margin).toBe('5px');
      expect(element.style.fontSize).toBe('');
    });

    it('should handle transitions from string to object styles', () => {
      const stylePatcher = patchStyle(element);

      // First set string style
      const stringStyle = 'color: red; font-size: 16px;';
      stylePatcher(null, stringStyle);

      // Then set object style
      const objStyle = { color: 'blue', margin: '10px' };
      stylePatcher(stringStyle, objStyle);

      expect(element.style.color).toBe('blue');
      expect(element.style.margin).toBe('10px');
      expect(element.style.fontSize).toBe('');
    });

    it('should handle transitions from object to string styles', () => {
      const stylePatcher = patchStyle(element);

      // First set object style
      const objStyle = { color: 'red', fontSize: '16px' };
      stylePatcher(null, objStyle);

      // Then set string style
      const stringStyle = 'color: blue; margin: 10px;';
      stylePatcher(objStyle, stringStyle);

      expect(element.style.cssText).toBe(stringStyle);
    });

    it('should handle CSS variables', () => {
      const stylePatcher = patchStyle(element);

      // Set CSS variables
      element.style.setProperty('--custom', 'value');

      // Apply string style
      stylePatcher(null, 'color: red;');

      // In JSDOM, CSS variables set with setProperty might be overwritten by cssText
      expect(element.style.color).toBe('red');
    });

    it('should remove all styles with null value', () => {
      const stylePatcher = patchStyle(element);

      // First set some styles
      element.style.color = 'red';
      element.style.fontSize = '16px';

      // Remove styles using null
      stylePatcher({ color: 'red', fontSize: '16px' }, null);

      expect(element.hasAttribute('style')).toBe(false);
    });

    it('should not update when styles have not changed', () => {
      const stylePatcher = patchStyle(element);

      // First set style
      const styles = { color: 'red' };
      stylePatcher(null, styles);

      // Monitor setProperty method calls
      const setPropertySpy = vi.spyOn(element.style, 'setProperty');

      // Set style again with the same value
      stylePatcher(styles, styles);

      // Should not trigger new setProperty calls
      expect(setPropertySpy).not.toHaveBeenCalled();
    });
  });

  describe('vendor prefixing functionality', () => {
    it('should handle browser-prefixed properties', () => {
      const stylePatcher = patchStyle(element);
      const styles = {
        userSelect: 'none',
      };

      stylePatcher(null, styles);

      // In real browsers, this would auto-add prefixes, but in JSDOM we can only check if property is set
      if ('userSelect' in element.style) {
        expect(element.style.userSelect).toBe('none');
      } else {
        // JSDOM might not fully support this property, but style attribute should be set
        expect(element.getAttribute('style')).not.toBe(null);
      }
    });

    it('should support multiple browser prefix versions using arrays', () => {
      const stylePatcher = patchStyle(element);
      const styles = {
        transform: ['rotate(45deg)', '-webkit-rotate(45deg)'],
      };

      stylePatcher(null, styles);

      // Check if property is set in JSDOM
      expect(element.style.transform).not.toBe('');
    });

    it('should cache resolved prefixed properties for better performance', () => {
      // First setting should parse prefixes
      setStyle(element.style, 'transform', 'rotate(45deg)');

      // Setting the same property again should use cached result
      setStyle(element.style, 'transform', 'rotate(90deg)');

      // Ideally, the second time should not execute prefix detection again
      // But since we can't directly test internal function caching, this test mainly ensures the second setting works
      expect(element.style.transform).toBe('rotate(90deg)');
    });
  });
});
