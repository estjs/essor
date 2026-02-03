import { describe, expect, it } from 'vitest';
import { getContext, resetContext, setContext } from '../src/jsx/context';

describe('jsx context stack', () => {
  it('pushes and pops context entries', () => {
    const ctx = { state: {}, path: {}, operationIndex: 0 };
    // @ts-ignore
    setContext(ctx);
    expect(getContext()).toBe(ctx);
    resetContext();
    expect(() => getContext()).toThrowError(/No active context/);
  });
});
