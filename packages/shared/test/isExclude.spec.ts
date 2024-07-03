import { type ExcludeType, isExclude } from '../src/comm';

describe('isExclude', () => {
  it('should return true if key is in the exclusion array', () => {
    const exclude: ExcludeType = ['key1', 'key2'];
    expect(isExclude('key1', exclude)).toBe(true);
    expect(isExclude('key2', exclude)).toBe(true);
    expect(isExclude('key3', exclude)).toBe(false);
  });

  it('should return true if exclusion function returns true', () => {
    const exclude: ExcludeType = (key: string | symbol) => key === 'key1';
    expect(isExclude('key1', exclude)).toBe(true);
    expect(isExclude('key2', exclude)).toBe(false);
  });

  it('should return false if no exclusion criteria is provided', () => {
    expect(isExclude('key1')).toBe(false);
    expect(isExclude('key2')).toBe(false);
  });

  it('should return false for an empty exclusion array', () => {
    const exclude: ExcludeType = [];
    expect(isExclude('key1', exclude)).toBe(false);
    expect(isExclude('key2', exclude)).toBe(false);
  });

  it('should handle symbols in exclusion array', () => {
    const symbolKey = Symbol('key');
    const exclude: ExcludeType = [symbolKey];
    expect(isExclude(symbolKey, exclude)).toBe(true);
    expect(isExclude(Symbol('otherKey'), exclude)).toBe(false);
  });

  it('should handle symbols in exclusion function', () => {
    const symbolKey = Symbol('key');
    const exclude: ExcludeType = (key: string | symbol) => key === symbolKey;
    expect(isExclude(symbolKey, exclude)).toBe(true);
    expect(isExclude(Symbol('otherKey'), exclude)).toBe(false);
  });
});
