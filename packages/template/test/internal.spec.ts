import { describe, expect, it } from 'vitest';
import * as internal from '@estjs/template/internal';

describe('@estjs/template/internal', () => {
  it('exposes the scope helper surface used by sibling packages', () => {
    expect(typeof internal.createScope).toBe('function');
    expect(typeof internal.disposeScope).toBe('function');
    expect(typeof internal.getActiveScope).toBe('function');
    expect(typeof internal.runWithScope).toBe('function');
  });

  it('can create and dispose a scope through the internal entrypoint', () => {
    const scope = internal.createScope(null);

    expect(scope.isDestroyed).toBe(false);

    internal.runWithScope(scope, () => {
      expect(internal.getActiveScope()).toBe(scope);
    });

    expect(internal.getActiveScope()).toBeNull();

    internal.disposeScope(scope);

    expect(scope.isDestroyed).toBe(true);
  });
});
