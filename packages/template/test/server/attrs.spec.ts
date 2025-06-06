import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, signal } from '@estjs/signal';
import {
  type NormalizedStyle,
  normalizeClassName,
  normalizeProps,
  normalizeStyle,
  parseStyleString,
  setSSGAttr,
  styleObjectToString,
} from '../../src/server/attrs';

describe('server/attrs module', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('normalizeStyle function', () => {
    it('should handle undefined or null styles', () => {
      expect(normalizeStyle(undefined)).toBeUndefined();
      expect(normalizeStyle(null)).toBeUndefined();
    });

    it('should return string styles as is', () => {
      const style = 'color: red; font-size: 16px;';
      expect(normalizeStyle(style)).toBe(style);
    });

    it('should return object styles as is', () => {
      const style = { color: 'red', fontSize: '16px' };
      expect(normalizeStyle(style)).toBe(style);
    });

    it('should handle array styles by merging them', () => {
      const style = [
        'color: red;',
        { fontSize: '16px' },
        { color: 'blue' }, // Should override the first color
      ];

      const result = normalizeStyle(style) as NormalizedStyle;
      expect(result).toBeTypeOf('object');
      expect(result.color).toBe('blue');
      expect(result.fontSize).toBe('16px');
    });

    it('should handle nested arrays', () => {
      const style = [['color: red;', { fontSize: '16px' }], { fontWeight: 'bold' }];

      const result = normalizeStyle(style) as NormalizedStyle;
      expect(result).toBeTypeOf('object');
      expect(result.color).toBe('red');
      expect(result.fontSize).toBe('16px');
      expect(result.fontWeight).toBe('bold');
    });

    it('should ignore non-string and non-object values in arrays', () => {
      const style = [
        'color: red;',
        null,
        undefined,
        123, // Should be ignored
        { fontSize: '16px' },
      ];

      const result = normalizeStyle(style) as NormalizedStyle;
      expect(result).toBeTypeOf('object');
      expect(result.color).toBe('red');
      expect(result.fontSize).toBe('16px');
    });
  });

  describe('parseStyleString function', () => {
    it('should parse CSS style string into object', () => {
      const css = 'color: red; font-size: 16px; margin: 8px;';
      const result = parseStyleString(css);

      expect(result).toEqual({
        color: 'red',
        'font-size': '16px',
        margin: '8px',
      });
    });

    it('should handle whitespace in CSS string', () => {
      const css = '  color : red ;  font-size  :  16px  ; ';
      const result = parseStyleString(css);

      expect(result).toEqual({
        color: 'red',
        'font-size': '16px',
      });
    });

    it('should handle value with colons', () => {
      const css = 'background: url(https://example.com/img.jpg); color: red;';
      const result = parseStyleString(css);

      expect(result).toEqual({
        background: 'url(https://example.com/img.jpg)',
        color: 'red',
      });
    });

    it('should handle values with semicolons inside parentheses', () => {
      const css = 'background: url(data:image/svg+xml;base64,abcdef); color: red;';
      const result = parseStyleString(css);

      expect(result).toEqual({
        background: 'url(data:image/svg+xml;base64,abcdef)',
        color: 'red',
      });
    });

    it('should remove CSS comments', () => {
      const css = 'color: red; /* This is a comment */ font-size: 16px;';
      const result = parseStyleString(css);

      expect(result).toEqual({
        color: 'red',
        'font-size': '16px',
      });
    });

    it('should handle multi-line CSS comments', () => {
      const css = `
        color: red;
        /* This is a
           multi-line comment */
        font-size: 16px;
      `;
      const result = parseStyleString(css);

      expect(result).toEqual({
        color: 'red',
        'font-size': '16px',
      });
    });

    it('should ignore invalid style items without colon', () => {
      const css = 'color: red; invalid-item; font-size: 16px;';
      const result = parseStyleString(css);

      expect(result).toEqual({
        color: 'red',
        'font-size': '16px',
      });
    });
  });

  describe('styleObjectToString function', () => {
    it('should return empty string for undefined or null styles', () => {
      expect(styleObjectToString(undefined)).toBe('');
      expect(styleObjectToString(null as any)).toBe('');
    });

    it('should return string styles as is', () => {
      const style = 'color: red; font-size: 16px;';
      expect(styleObjectToString(style)).toBe(style);
    });

    it('should convert style object to CSS string', () => {
      const style = {
        color: 'red',
        fontSize: '16px',
        marginTop: '8px',
      };

      const result = styleObjectToString(style);
      // Convert to kebab case
      expect(result).toContain('color:red;');
      expect(result).toContain('font-size:16px;');
      expect(result).toContain('margin-top:8px;');
    });

    it('should handle CSS variables correctly', () => {
      const style = {
        '--custom-color': 'blue',
        color: 'var(--custom-color)',
      };

      const result = styleObjectToString(style);
      expect(result).toContain('--custom-color:blue;');
      expect(result).toContain('color:var(--custom-color);');
    });

    it('should handle numeric values', () => {
      const style = {
        zIndex: 10,
        opacity: 0.5,
      };

      const result = styleObjectToString(style);
      expect(result).toContain('z-index:10;');
      expect(result).toContain('opacity:0.5;');
    });

    it('should ignore non-string and non-number values', () => {
      const style = {
        color: 'red',
        fontSize: '16px',
        margin: undefined,
        padding: null,
        border: { width: '1px' }, // Object should be ignored
      } as any;

      const result = styleObjectToString(style);
      expect(result).toContain('color:red;');
      expect(result).toContain('font-size:16px;');
      expect(result).not.toContain('margin');
      expect(result).not.toContain('padding');
      expect(result).not.toContain('border');
    });
  });

  describe('normalizeClassName function', () => {
    it('should handle undefined or null class names', () => {
      expect(normalizeClassName(undefined)).toBe('');
      expect(normalizeClassName(null)).toBe('');
    });

    it('should return string class names as is', () => {
      expect(normalizeClassName('btn btn-primary')).toBe('btn btn-primary');
    });

    it('should handle array class names by joining them', () => {
      const classes = ['btn', 'btn-primary', 'active'];
      expect(normalizeClassName(classes)).toBe('btn btn-primary active');
    });

    it('should handle nested array class names', () => {
      const classes = ['btn', ['btn-primary', 'large'], 'active'];
      expect(normalizeClassName(classes)).toBe('btn btn-primary large active');
    });

    it('should filter out falsy values from arrays', () => {
      const classes = ['btn', null, undefined, false, 'active'];
      expect(normalizeClassName(classes)).toBe('btn active');
    });

    it('should handle object class names', () => {
      const classes = {
        btn: true,
        'btn-primary': true,
        active: false,
        disabled: null,
        large: 'yes', // truthy value
      };

      const result = normalizeClassName(classes);
      expect(result).toContain('btn');
      expect(result).toContain('btn-primary');
      expect(result).toContain('large');
      expect(result).not.toContain('active');
      expect(result).not.toContain('disabled');
    });

    it('should handle complex mixed types', () => {
      const classes = [
        'btn',
        { 'btn-primary': true, 'btn-secondary': false },
        ['active', { large: true }],
      ];

      const result = normalizeClassName(classes);
      expect(result).toContain('btn');
      expect(result).toContain('btn-primary');
      expect(result).toContain('active');
      expect(result).toContain('large');
      expect(result).not.toContain('btn-secondary');
    });
  });

  describe('normalizeProps function', () => {
    it('should return null for null props', () => {
      expect(normalizeProps(null)).toBeNull();
    });

    it('should normalize class property', () => {
      const props = {
        class: ['btn', 'btn-primary'],
      };

      const result = normalizeProps(props);
      expect(result?.class).toBe('btn btn-primary');
    });

    it('should normalize style property', () => {
      const props = {
        style: ['color: red;', { fontSize: '16px' }],
      };

      const result = normalizeProps(props);
      expect(result?.style).toBeTypeOf('object');

      const style = result?.style as NormalizedStyle;
      expect(style.color).toBe('red');
      expect(style.fontSize).toBe('16px');
    });

    it('should handle both class and style normalization', () => {
      const props = {
        class: ['btn', 'btn-primary'],
        style: { color: 'red', fontSize: '16px' },
        id: 'test-button',
      };

      const result = normalizeProps(props);
      expect(result?.class).toBe('btn btn-primary');
      expect(result?.style).toEqual({ color: 'red', fontSize: '16px' });
      expect(result?.id).toBe('test-button');
    });

    it('should not modify string class', () => {
      const props = {
        class: 'btn btn-primary',
        id: 'test-button',
      };

      const result = normalizeProps(props);
      expect(result?.class).toBe('btn btn-primary');
    });

    it('should handle empty props object', () => {
      const props = {};
      const result = normalizeProps(props);
      expect(result).toEqual({});
    });
  });

  describe('setSSGAttr function', () => {
    it('should return empty string for null, undefined, or false values', () => {
      expect(setSSGAttr('data-test', null, 'hk1')).toBe('');
      expect(setSSGAttr('data-test', undefined, 'hk1')).toBe('');
      expect(setSSGAttr('data-test', false, 'hk1')).toBe('');
    });

    it('should generate attribute string for string values', () => {
      expect(setSSGAttr('data-test', 'value', 'hk1')).toBe(' data-test="value"');
    });

    it('should generate attribute without value for true boolean attributes', () => {
      expect(setSSGAttr('checked', true, 'hk1')).toBe(' checked');
      expect(setSSGAttr('disabled', true, 'hk1')).toBe(' disabled');
    });

    it('should handle signal values by unwrapping them', () => {
      const value = signal('test-value');
      expect(setSSGAttr('data-test', value, 'hk1')).toBe(' data-test="test-value"');
    });

    it('should handle computed values by unwrapping them', () => {
      const value = computed(() => 'computed-value');
      expect(setSSGAttr('data-test', value, 'hk1')).toBe(' data-test="computed-value"');
    });

    it('should handle style attributes with string values', () => {
      expect(setSSGAttr('style', 'color: red;', 'hk1')).toBe(' style="color: red;"');
    });

    it('should handle style attributes with object values', () => {
      const style = { color: 'red', fontSize: '16px' };
      const result = setSSGAttr('style', style, 'hk1');

      expect(result).toContain('style="');
      expect(result).toContain('color:red;');
      expect(result).toContain('font-size:16px;');
    });

    it('should handle style attributes with array values', () => {
      const style = ['color: red;', { fontSize: '16px' }];
      const result = setSSGAttr('style', style, 'hk1');

      expect(result).toContain('style="');
      expect(result).toContain('color:red;');
      expect(result).toContain('font-size:16px;');
    });

    it('should ignore invalid style values', () => {
      expect(setSSGAttr('style', null, 'hk1')).toBe('');

      // Empty object should result in empty string
      expect(setSSGAttr('style', {}, 'hk1')).toBe('');
    });

    it('should handle class attributes with string values', () => {
      expect(setSSGAttr('class', 'btn btn-primary', 'hk1')).toBe(' class="btn btn-primary"');
    });

    it('should handle class attributes with array values', () => {
      const classes = ['btn', 'btn-primary', 'active'];
      expect(setSSGAttr('class', classes, 'hk1')).toBe(' class="btn btn-primary active"');
    });

    it('should handle class attributes with object values', () => {
      const classes = { btn: true, 'btn-primary': true, active: false };
      expect(setSSGAttr('class', classes, 'hk1')).toBe(' class="btn btn-primary"');
    });

    it('should ignore empty class values', () => {
      expect(setSSGAttr('class', '', 'hk1')).toBe('');
      expect(setSSGAttr('class', [], 'hk1')).toBe('');
      expect(setSSGAttr('class', {}, 'hk1')).toBe('');
    });

    it('should ignore event handler attributes', () => {
      expect(setSSGAttr('onClick', () => {}, 'hk1')).toBe('');
      expect(setSSGAttr('onInput', () => {}, 'hk1')).toBe('');
    });
  });
});
