import { describe, expect, it } from 'vitest';
import { deepClone } from '../src/comm';
describe('deepClone', () => {
  it('should clone primitive values', () => {
    expect(deepClone(42)).toBe(42);
    expect(deepClone('hello')).toBe('hello');
    expect(deepClone(null)).toBe(null);
    expect(deepClone(undefined)).toBe(undefined);
  });

  it('should clone arrays', () => {
    const arr = [1, 2, 3];
    const clonedArr = deepClone(arr);
    expect(clonedArr).toEqual(arr);
    expect(clonedArr).not.toBe(arr);
  });

  it('should clone plain objects', () => {
    const obj = { a: 1, b: { c: 2 } };
    const clonedObj = deepClone(obj);
    expect(clonedObj).toEqual(obj);
    expect(clonedObj).not.toBe(obj);
    expect(clonedObj.b).not.toBe(obj.b);
  });

  it('should handle circular references', () => {
    const obj: any = { a: 1 };
    obj.b = obj;
    const clonedObj = deepClone(obj);
    expect(clonedObj).toEqual(obj);
    expect(clonedObj.b).toBe(clonedObj);
  });

  it('should clone Date objects', () => {
    const date = new Date();
    const clonedDate = deepClone(date);
    expect(clonedDate).toEqual(date);
    expect(clonedDate).not.toBe(date);
  });

  it('should clone RegExp objects', () => {
    const regExp = /hello/g;
    const clonedRegExp = deepClone(regExp);
    expect(clonedRegExp).toEqual(regExp);
    expect(clonedRegExp).not.toBe(regExp);
  });

  it('should clone Map objects', () => {
    const map = new Map();
    map.set('key1', 'value1');
    map.set('key2', { a: 1 });
    const clonedMap = deepClone(map);
    expect(clonedMap).toEqual(map);
    expect(clonedMap).not.toBe(map);
    expect(clonedMap.get('key2')).not.toBe(map.get('key2'));
  });

  it('should clone Set objects', () => {
    const set = new Set();
    set.add(1);
    set.add({ a: 1 });
    const clonedSet = deepClone(set);
    expect(clonedSet).toEqual(set);
    expect(clonedSet).not.toBe(set);
    expect([...clonedSet][1]).not.toBe([...set][1]);
  });

  it('should handle complex nested structures', () => {
    const obj = {
      a: [1, 2, { b: 3 }],
      c: new Map([['key1', new Set([1, 2, 3])]]),
      d: new Date(),
    };
    const clonedObj = deepClone(obj);
    expect(clonedObj).toEqual(obj);
    expect(clonedObj.a).not.toBe(obj.a);
    expect(clonedObj.a[2]).not.toBe(obj.a[2]);
    expect(clonedObj.c).not.toBe(obj.c);
    expect(clonedObj.c.get('key1')).not.toBe(obj.c.get('key1'));
    expect(clonedObj.d).not.toBe(obj.d);
  });
});
