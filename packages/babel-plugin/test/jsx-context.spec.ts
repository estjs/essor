import { describe, expect, it } from 'vitest';
import { getContext, resetContext, setContext } from '../src/jsx/context';

describe('jsx context stack', () => {
  it('pushes and pops context entries', () => {
    const ctx = { state: {} as any, path: {} as any, operationIndex: 0 };
    setContext(ctx);
    expect(getContext()).toBe(ctx);
    resetContext();
    expect(() => getContext()).toThrowError(/No active context/);
  });
});
