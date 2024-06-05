import { describe, expect, it } from 'vitest';
import { deepEqual } from '../src/comm';

describe('deepEqual', () => {
  it('should return true for equal primitive values', () => {
    expect(deepEqual(42, 42)).toBe(true);
    expect(deepEqual('hello', 'hello')).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
  });

  it('should return false for different primitive values', () => {
    expect(deepEqual(42, 43)).toBe(false);
    expect(deepEqual('hello', 'world')).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
  });

  it('should return true for equal arrays', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([], [])).toBe(true);
  });

  it('should return false for different arrays', () => {
    expect(deepEqual([1, 2, 3], [4, 5, 6])).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it('should return true for equal objects', () => {
    const obj1 = { a: 1, b: { c: 2 } };
    const obj2 = { a: 1, b: { c: 2 } };
    expect(deepEqual(obj1, obj2)).toBe(true);
  });

  it('should return false for different objects', () => {
    const obj1 = { a: 1, b: { c: 2 } };
    const obj2 = { a: 1, b: { c: 3 } };
    expect(deepEqual(obj1, obj2)).toBe(false);
    expect(deepEqual(obj1, { a: 1 })).toBe(false);
  });

  it('should handle circular references', () => {
    const obj1: any = { a: 1 };
    const obj2: any = { a: 1 };
    obj1.b = obj1;
    obj2.b = obj2;
    expect(deepEqual(obj1, obj2)).toBe(true);
  });

  it('should return true for equal Date objects', () => {
    const date1 = new Date();
    const date2 = new Date(date1.getTime());
    expect(deepEqual(date1, date2)).toBe(true);
  });

  it('should return true for equal Map objects', () => {
    const map1 = new Map();
    map1.set('key1', 'value1');
    map1.set('key2', { a: 1 });

    const map2 = new Map();
    map2.set('key1', 'value1');
    map2.set('key2', { a: 1 });

    expect(deepEqual(map1, map2)).toBe(true);
  });

  it('should return false for different Map objects', () => {
    const map1 = new Map();
    map1.set('key1', 'value1');
    map1.set('key2', { a: 1 });

    const map2 = new Map();
    map2.set('key1', 'value2');
    map2.set('key2', { a: 1 });

    expect(deepEqual(map1, map2)).toBe(false);
  });

  it('should return true for equal Set objects', () => {
    const set1 = new Set();
    set1.add(1);
    set1.add({ a: 1 });

    const set2 = new Set();
    set2.add(1);
    set2.add({ a: 1 });

    expect(deepEqual(set1, set2)).toBe(true);
  });

  it('should return false for different Set objects', () => {
    const set1 = new Set();
    set1.add(1);
    set1.add({ a: 1 });

    const set2 = new Set();
    set2.add(2);
    set2.add({ a: 1 });

    expect(deepEqual(set1, set2)).toBe(false);
  });

  it('should handle complex nested structures', () => {
    const obj1 = {
      a: [1, 2, { b: 3 }],
      c: new Map([['key1', new Set([1, 2, 3])]]),
      d: new Date(),
    };

    const obj2 = {
      a: [1, 2, { b: 3 }],
      c: new Map([['key1', new Set([1, 2, 3])]]),
      d: new Date(obj1.d.getTime()),
    };

    expect(deepEqual(obj1, obj2)).toBe(true);
  });

  it('should return false for functions', () => {
    const func1 = () => {};
    const func2 = () => {};
    expect(deepEqual(func1, func2)).toBe(false);
    expect(deepEqual(func1, func1)).toBe(true);
  });
});
