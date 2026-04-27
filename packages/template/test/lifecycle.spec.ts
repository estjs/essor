import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  onDestroy,
  onMount,
  onUpdate,
  triggerMountHooks,
  triggerUpdateHooks,
} from '../src/lifecycle';
import { createScope, disposeScope, runWithScope } from '../src/scope';

describe('lifecycle hooks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs guard errors when hooks are registered outside a scope', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    onMount(() => {});
    onUpdate(() => {});
    onDestroy(() => {});

    expect(errorSpy).toHaveBeenCalledTimes(3);
    expect(errorSpy.mock.calls[0]?.[0]).toContain('onMount() must be called within a scope');
    expect(errorSpy.mock.calls[1]?.[0]).toContain('onUpdate() must be called within a scope');
    expect(errorSpy.mock.calls[2]?.[0]).toContain('onDestroy() must be called within a scope');
  });

  it('runs onMount immediately when the scope is already mounted', () => {
    const scope = createScope(null);
    scope.isMounted = true;
    const hook = vi.fn();

    runWithScope(scope, () => onMount(hook));

    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('triggers queued mount hooks, clears them, and marks the scope as mounted', async () => {
    const scope = createScope(null);
    const syncHook = vi.fn();
    const asyncHook = vi.fn(async () => {});

    runWithScope(scope, () => {
      onMount(syncHook);
      onMount(asyncHook);
    });

    await triggerMountHooks(scope);

    expect(syncHook).toHaveBeenCalledTimes(1);
    expect(asyncHook).toHaveBeenCalledTimes(1);
    expect(scope.isMounted).toBe(true);
    expect(scope.onMount).toEqual([]);
  });

  it('triggers update hooks and skips destroyed scopes', () => {
    const activeScope = createScope(null);
    const destroyedScope = createScope(null);
    const hook = vi.fn();
    const skipped = vi.fn();

    runWithScope(activeScope, () => onUpdate(hook));
    runWithScope(destroyedScope, () => onUpdate(skipped));
    destroyedScope.isDestroyed = true;

    triggerUpdateHooks(activeScope);
    triggerUpdateHooks(destroyedScope);

    expect(hook).toHaveBeenCalledTimes(1);
    expect(skipped).not.toHaveBeenCalled();
  });

  it('reports async mount hook rejections', async () => {
    const scope = createScope(null);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    runWithScope(scope, () => {
      onMount(() => Promise.reject(new Error('boom')));
    });

    await triggerMountHooks(scope);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Essor error]: Scope('),
      expect.any(Error),
    );
  });

  it('executes registered destroy hooks during scope disposal', () => {
    const scope = createScope(null);
    const hook = vi.fn();

    runWithScope(scope, () => onDestroy(hook));
    disposeScope(scope);

    expect(hook).toHaveBeenCalledTimes(1);
  });
});
