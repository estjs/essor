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
  private effects: ScopedReactiveEffect[] = [];
  private scopes: EffectScope[] = [];
  private cleanups: Array<() => void> = [];

  constructor(
    public detached = false,
    public parent: EffectScope | undefined = undefined,
  ) {
    if (!detached && activeEffectScope) {
      this.parent = activeEffectScope;
      activeEffectScope.scopes.push(this);
    }
  }

  get active(): boolean {
    return this._active;
  }

  pause(): void {
    if (!this._active) {
      return;
    }

    for (let i = 0; i < this.scopes.length; i++) {
      this.scopes[i].pause();
    }

    for (let i = 0; i < this.effects.length; i++) {
      this.effects[i].pause?.();
    }
  }

  resume(): void {
    if (!this._active) {
      return;
    }

    for (let i = 0; i < this.scopes.length; i++) {
      this.scopes[i].resume();
    }

    for (let i = 0; i < this.effects.length; i++) {
      this.effects[i].resume?.();
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

    for (let i = 0; i < this.scopes.length; i++) {
      this.scopes[i].stop(true);
    }
    this.scopes.length = 0;

    const effects = this.effects.slice();
    this.effects.length = 0;

    for (const effect of effects) {
      effect.stop();
    }

    for (let i = 0; i < this.cleanups.length; i++) {
      this.cleanups[i]();
    }
    this.cleanups.length = 0;

    if (!fromParent && this.parent) {
      const index = this.parent.scopes.indexOf(this);
      if (index >= 0) {
        this.parent.scopes.splice(index, 1);
      }
    }

    this.parent = undefined;
  }

  _record(effect: ScopedReactiveEffect): void {
    this.effects.push(effect);
    effect.scope = this;
  }

  _remove(effect: ScopedReactiveEffect): void {
    const index = this.effects.indexOf(effect);
    if (index >= 0) {
      this.effects.splice(index, 1);
    }
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
