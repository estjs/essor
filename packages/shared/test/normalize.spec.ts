import { describe, it } from 'vitest';
import { normalizeProps } from '../../core/src';
import {
  normalizeClassName,
  normalizeStyle,
  parseStyleString,
  styleObjectToString,
  styleToString,
} from '../src';

describe('normalizeStyle', () => {
  it('normalizes string style', () => {
    expect(normalizeStyle('color: red;')).toBe('color: red;');
  });

  it('normalizes object style', () => {
    expect(normalizeStyle({ color: 'red' })).toEqual({ color: 'red' });
  });

  it('normalizes array style', () => {
    expect(normalizeStyle([{ color: 'red' }, 'font-size: 14px'])).toEqual({
      'color': 'red',
      'font-size': '14px',
    });
  });

  it('handles nested arrays', () => {
    expect(normalizeStyle([{ color: 'red' }, [{ fontSize: '14px' }]])).toEqual({
      color: 'red',
      fontSize: '14px',
    });
  });

  it('returns undefined for invalid types', () => {
    expect(normalizeStyle(null)).toBeUndefined();
    expect(normalizeStyle(123)).toBeUndefined();
  });

  it('handles deeply nested arrays', () => {
    // Three levels of nesting
    expect(normalizeStyle([{ color: 'red' }, [[{ fontSize: '14px' }]]])).toEqual({
      color: 'red',
      fontSize: '14px',
    });

    // Four levels of nesting with mixed types
    expect(
      normalizeStyle([
        { color: 'red' },
        [[[{ fontSize: '14px' }, 'margin: 10px']]],
        { padding: '5px' },
      ]),
    ).toEqual({
      'color': 'red',
      'fontSize': '14px',
      'margin': '10px',
      'padding': '5px',
    });

    // Deeply nested with empty arrays
    expect(normalizeStyle([{ color: 'red' }, [], [[], [{ fontSize: '14px' }]]])).toEqual({
      color: 'red',
      fontSize: '14px',
    });
  });

  it('handles arrays with null/undefined items', () => {
    expect(normalizeStyle([{ color: 'red' }, null, undefined, { fontSize: '14px' }])).toEqual({
      color: 'red',
      fontSize: '14px',
    });
  });

  it('merges styles with later values overriding earlier ones', () => {
    expect(normalizeStyle([{ color: 'red' }, { color: 'blue' }])).toEqual({
      color: 'blue',
    });
  });
});

describe('parseStyleString', () => {
  it('parses simple style string', () => {
    expect(parseStyleString('color: red; font-size: 14px;')).toEqual({
      'color': 'red',
      'font-size': '14px',
    });
  });

  it('removes comments', () => {
    expect(parseStyleString('color: red; /* comment */ font-size: 14px;')).toEqual({
      'color': 'red',
      'font-size': '14px',
    });
  });

  it('handles empty string', () => {
    expect(parseStyleString('')).toEqual({});
  });

  it('handles values containing colons (URLs)', () => {
    expect(parseStyleString('background-image: url(https://example.com/image.png);')).toEqual({
      'background-image': 'url(https://example.com/image.png)',
    });

    expect(parseStyleString('background: url(http://example.com:8080/path);')).toEqual({
      background: 'url(http://example.com:8080/path)',
    });
  });

  it('handles values containing colons (data URIs)', () => {
    expect(
      parseStyleString('background-image: url(data:image/png;base64,iVBORw0KGgo=);'),
    ).toEqual({
      'background-image': 'url(data:image/png;base64,iVBORw0KGgo=)',
    });
  });

  it('handles multiple properties with colons in values', () => {
    expect(
      parseStyleString(
        'background: url(https://example.com/img.png); border-image: url(data:image/svg+xml;utf8,<svg></svg>);',
      ),
    ).toEqual({
      'background': 'url(https://example.com/img.png)',
      'border-image': 'url(data:image/svg+xml;utf8,<svg></svg>)',
    });
  });

  it('handles CSS time values with colons', () => {
    // Time values don't typically have colons, but testing edge cases
    expect(parseStyleString('content: "Time: 12:30";')).toEqual({
      content: '"Time: 12:30"',
    });
  });

  it('handles whitespace variations', () => {
    expect(parseStyleString('  color  :  red  ;  font-size  :  14px  ;  ')).toEqual({
      'color': 'red',
      'font-size': '14px',
    });
  });

  it('handles properties without values', () => {
    expect(parseStyleString('color:; font-size: 14px;')).toEqual({
      'font-size': '14px',
    });
  });
});

describe('styleObjectToString', () => {
  it('converts object to string', () => {
    expect(styleObjectToString({ color: 'red', fontSize: '14px' })).toBe(
      'color:red;font-size:14px;',
    );
  });

  it('handles CSS variables', () => {
    expect(styleObjectToString({ '--custom-prop': 'value' })).toBe('--custom-prop:value;');
  });

  it('returns string as is', () => {
    expect(styleObjectToString('color: red;')).toBe('color: red;');
  });

  it('returns empty string for falsy values', () => {
    expect(styleObjectToString(null as any)).toBe('');
    expect(styleObjectToString(undefined)).toBe('');
  });
});

describe('styleToString', () => {
  it('converts object to string', () => {
    expect(styleToString({ color: 'red', fontSize: '14px' })).toBe('color:red;font-size:14px;');
  });

  it('handles CSS variables', () => {
    expect(styleToString({ '--custom-prop': 'value' })).toBe('--custom-prop:value;');
  });

  it('returns string as is', () => {
    expect(styleToString('color: red;')).toBe('color: red;');
  });

  it('returns empty string for falsy values', () => {
    expect(styleToString(null as any)).toBe('');
    expect(styleToString(undefined)).toBe('');
  });

  it('skips non-string/non-number values', () => {
    // Test with object values - should be skipped
    expect(styleToString({ color: 'red', nested: { value: 'blue' } } as any)).toBe('color:red;');
    // Test with array values - should be skipped
    expect(styleToString({ color: 'red', items: ['a', 'b'] } as any)).toBe('color:red;');
    // Test with boolean values - should be skipped
    expect(styleToString({ color: 'red', active: true } as any)).toBe('color:red;');
    // Test with null values - should be skipped
    expect(styleToString({ color: 'red', empty: null } as any)).toBe('color:red;');
    // Test with undefined values - should be skipped
    expect(styleToString({ color: 'red', missing: undefined } as any)).toBe('color:red;');
    // Test with function values - should be skipped
    expect(styleToString({ color: 'red', fn: () => {} } as any)).toBe('color:red;');
  });

  it('handles numeric values', () => {
    expect(styleToString({ zIndex: 100, opacity: 0.5 })).toBe('z-index:100;opacity:0.5;');
  });
});

describe('normalizeClassName', () => {
  it('normalizes string class', () => {
    expect(normalizeClassName('foo bar')).toBe('foo bar');
  });

  it('normalizes array class', () => {
    expect(normalizeClassName(['foo', 'bar'])).toBe('foo bar');
  });

  it('normalizes object class', () => {
    expect(normalizeClassName({ foo: true, bar: false, baz: true })).toBe('foo baz');
  });

  it('normalizes nested array class', () => {
    expect(normalizeClassName(['foo', ['bar', { baz: true }]])).toBe('foo bar baz');
  });

  it('converts number input to string', () => {
    expect(normalizeClassName(123)).toBe('123');
    expect(normalizeClassName(0)).toBe('0');
    expect(normalizeClassName(45.67)).toBe('45.67');
  });

  it('returns empty string for object with all false values', () => {
    expect(normalizeClassName({ foo: false, bar: false, baz: false })).toBe('');
    expect(normalizeClassName({ active: false })).toBe('');
    expect(normalizeClassName({ a: 0, b: null, c: undefined, d: '' })).toBe('');
  });

  it('handles null and undefined', () => {
    expect(normalizeClassName(null)).toBe('');
    expect(normalizeClassName(undefined)).toBe('');
  });

  it('trims whitespace from string input', () => {
    expect(normalizeClassName('  foo  ')).toBe('foo');
    expect(normalizeClassName('  foo bar  ')).toBe('foo bar');
  });
});

describe('normalizeProps', () => {
  it('normalizes class and style', () => {
    const props = {
      class: ['foo', 'bar'],
      style: [{ color: 'red' }, 'font-size: 14px'],
      id: 'test',
    };
    const normalized = normalizeProps(props);
    expect(normalized).toEqual({
      class: 'foo bar',
      style: { 'color': 'red', 'font-size': '14px' },
      id: 'test',
    });
  });

  it('returns null for null props', () => {
    expect(normalizeProps(null)).toBeNull();
  });
});
