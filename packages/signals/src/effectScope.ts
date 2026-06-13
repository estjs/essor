import { warn } from '@estjs/shared';

export interface ScopedReactiveEffect {
  stop(): void;
  pause?(): void;
  resume?(): void;
  scope?: EffectScope;
}

export let activeEffectScope: EffectScope | undefined;

export class EffectScope {
  private _active = true;
  // Use Sets instead of arrays for O(1) add/delete instead of O(n) indexOf+splice
  private effects = new Set<ScopedReactiveEffect>();
  private scopes = new Set<EffectScope>();
  private cleanups: Array<() => void> = [];

  constructor(
    public detached = false,
    public parent: EffectScope | undefined = undefined,
  ) {
    if (!detached && activeEffectScope) {
      this.parent = activeEffectScope;
      activeEffectScope.scopes.add(this);
    }
  }

  get active(): boolean {
    return this._active;
  }

  pause(): void {
    if (!this._active) {
      return;
    }

    for (const scope of this.scopes) {
      scope.pause();
    }

    for (const effect of this.effects) {
      effect.pause?.();
    }
  }

  resume(): void {
    if (!this._active) {
      return;
    }

    for (const scope of this.scopes) {
      scope.resume();
    }

    for (const effect of this.effects) {
      effect.resume?.();
    }
  }

  run<T>(fn: () => T): T | undefined {
    if (!this._active) {
      if (__DEV__) {
        warn('cannot run an inactive effect scope.');
      }
      return;
    }

    const prevScope = activeEffectScope;
    activeEffectScope = this;

    try {
      return fn();
    } finally {
      activeEffectScope = prevScope;
    }
  }

  stop(fromParent = false): void {
    if (!this._active) {
      return;
    }

    this._active = false;

    // Snapshot before clearing to avoid mutation during iteration
    for (const scope of this.scopes) {
      scope.stop(true);
    }
    this.scopes.clear();

    // Snapshot effects before clearing — some stop() implementations may
    // call _remove() which would otherwise mutate the Set mid-iteration.
    const effects = Array.from(this.effects);
    this.effects.clear();
    for (const effect of effects) {
      effect.stop();
    }

    for (let i = 0; i < this.cleanups.length; i++) {
      this.cleanups[i]();
    }
    this.cleanups.length = 0;

    if (!fromParent && this.parent) {
      // O(1) Set.delete instead of O(n) indexOf+splice
      this.parent.scopes.delete(this);
    }

    this.parent = undefined;
  }

  _record(effect: ScopedReactiveEffect): void {
    this.effects.add(effect);
    effect.scope = this;
  }

  _remove(effect: ScopedReactiveEffect): void {
    // O(1) Set.delete instead of O(n) indexOf+splice
    this.effects.delete(effect);
  }

  _pushCleanup(fn: () => void): void {
    this.cleanups.push(fn);
  }
}

export function effectScope(detached = false): EffectScope {
  return new EffectScope(detached);
}

export function getCurrentScope(): EffectScope | undefined {
  return activeEffectScope;
}

export function setCurrentScope(scope?: EffectScope): EffectScope | undefined {
  const prevScope = activeEffectScope;
  activeEffectScope = scope;
  return prevScope;
}

export function onScopeDispose(fn: () => void, failSilently = false): void {
  if (activeEffectScope) {
    activeEffectScope._pushCleanup(fn);
  } else if (__DEV__ && !failSilently) {
    warn('onScopeDispose() is called when there is no active effect scope to be associated with.');
  }
}

export function recordDisposable(effect: ScopedReactiveEffect, scope = activeEffectScope): void {
  if (scope && scope.active) {
    scope._record(effect);
  }
}

export function releaseDisposable(effect: ScopedReactiveEffect): void {
  const scope = effect.scope;
  if (!scope) {
    return;
  }

  effect.scope = undefined;
  scope._remove(effect);
}
