import { error, warn } from '@estjs/shared';

export interface ScopedReactiveEffect {
  stop(): void;
  pause?(): void;
  resume?(): void;
  scope?: EffectScope;
}

/**
 * EffectScope lifecycle state.
 *
 * - `Active`   — accepting new effects, running normally
 * - `Paused`   — effects temporarily frozen (no new tracking, no re-execution)
 * - `Disposed` — permanently stopped, all effects cleaned up
 */
const enum ScopeState {
  Active,
  Paused,
  Disposed,
}

export let activeEffectScope: EffectScope | undefined;

export class EffectScope {
  private _state: ScopeState = ScopeState.Active;
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
    return this._state !== ScopeState.Disposed;
  }

  /** Whether the scope is paused. */
  get isPaused(): boolean {
    return this._state === ScopeState.Paused;
  }

  /** Whether the scope has been stopped / disposed. */
  get isDisposed(): boolean {
    return this._state === ScopeState.Disposed;
  }

  pause(): void {
    if (this._state !== ScopeState.Active) {
      return;
    }

    this._state = ScopeState.Paused;

    for (const scope of this.scopes) {
      scope.pause();
    }

    for (const effect of this.effects) {
      effect.pause?.();
    }
  }

  resume(): void {
    if (this._state !== ScopeState.Paused) {
      return;
    }

    this._state = ScopeState.Active;

    for (const scope of this.scopes) {
      scope.resume();
    }

    for (const effect of this.effects) {
      effect.resume?.();
    }
  }

  run<T>(fn: () => T): T | undefined {
    // Only a disposed scope refuses to run. A paused scope can still run fn()
    // — pausing freezes effect re-execution, it does not make the scope unusable.
    if (this._state === ScopeState.Disposed) {
      if (__DEV__) {
        warn('cannot run a disposed effect scope.');
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
    if (this._state === ScopeState.Disposed) {
      return;
    }

    this._state = ScopeState.Disposed;

    try {
      // Snapshot before clearing to avoid mutation during iteration
      for (const scope of this.scopes) {
        try {
          scope.stop(true);
        } catch (error_) {
          if (__DEV__) error('[EffectScope] child scope disposal threw:', error_);
        }
      }
      this.scopes.clear();

      // Snapshot effects before clearing — some stop() implementations may
      // call _remove() which would otherwise mutate the Set mid-iteration.
      const effects = Array.from(this.effects);
      this.effects.clear();
      for (const effect of effects) {
        try {
          effect.stop();
        } catch (error_) {
          if (__DEV__) error('[EffectScope] effect disposal threw:', error_);
        }
      }

      for (let i = 0; i < this.cleanups.length; i++) {
        try {
          this.cleanups[i]();
        } catch (error_) {
          if (__DEV__) error('[EffectScope] cleanup threw:', error_);
        }
      }
      this.cleanups.length = 0;
    } finally {
      // Always detach from the parent and drop the parent reference, even if a
      // disposal step above threw — otherwise a disposed scope would remain
      // pinned in its parent's set and leak its ancestor chain.
      if (!fromParent && this.parent) {
        // O(1) Set.delete instead of O(n) indexOf+splice
        this.parent.scopes.delete(this);
      }
      this.parent = undefined;
    }
  }

  _record(effect: ScopedReactiveEffect): void {
    this.effects.add(effect);
    effect.scope = this;
    // An effect created while the scope is paused must inherit the pause,
    // otherwise it keeps responding to dependency changes while its siblings
    // are frozen. resume() iterates `effects`, so it is resumed with the rest.
    //
    // Note: the effect's INITIAL run still executes — effect()/watch() run
    // their body eagerly on creation, before/independently of this pause.
    // Pausing only freezes subsequent dependency-change notifications.
    if (this._state === ScopeState.Paused) {
      effect.pause?.();
    }
  }

  _remove(effect: ScopedReactiveEffect): void {
    // O(1) Set.delete instead of O(n) indexOf+splice
    this.effects.delete(effect);
  }

  _pushCleanup(fn: () => void): void {
    // A disposed scope will never run its cleanups again — registering one
    // would silently create a cleanup that never executes (and pin its
    // closure). Warn and drop instead (SIG-30).
    if (this._state === ScopeState.Disposed) {
      if (__DEV__) {
        warn('[EffectScope] cleanup registered on a disposed scope will never run.');
      }
      return;
    }
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
