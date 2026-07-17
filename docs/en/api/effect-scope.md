# effectScope

Creates an effect scope that collects the reactive effects (`effect`, `computed`, `watch`) created inside it, so they can be paused, resumed, or disposed together.

## Basic Usage

```ts
import { effect, effectScope, signal } from '@estjs/signals';

const count = signal(0);
const scope = effectScope();

scope.run(() => {
  effect(() => {
    console.log(`count is ${count.value}`);
  });
  // more effects, computeds, watchers...
});

count.value = 1; // logs: "count is 1"

// Dispose every effect created inside the scope at once
scope.stop();

count.value = 2; // nothing logged — all effects were stopped
```

## The EffectScope Class

`effectScope()` returns an `EffectScope` instance with the following public API:

- **run(fn)** — Executes `fn` with this scope as the active scope. Every effect created during `fn` is recorded by the scope. Returns the return value of `fn`. A disposed scope refuses to run (warns in development and returns `undefined`); a paused scope can still run — pausing freezes effect re-execution, it does not make the scope unusable.
- **stop()** — Permanently disposes the scope: stops all recorded effects, stops all child scopes recursively, runs all `onScopeDispose` cleanups, and detaches from the parent scope. Idempotent — calling it again is a no-op.
- **pause()** — Temporarily freezes the scope: all recorded effects and all child scopes are paused. Paused effects do not re-execute when their dependencies change.
- **resume()** — Reactivates a paused scope, resuming all recorded effects and child scopes.
- **active** — `true` as long as the scope has not been disposed (a paused scope is still active).
- **isPaused** — `true` while the scope is paused.
- **isDisposed** — `true` after the scope has been stopped.

## Nested Scopes

A scope created while another scope is running (via `run`) automatically becomes a child of that scope, unless it is created as detached. Stopping the parent recursively stops all children; pausing/resuming the parent also cascades to children.

```ts
import { effectScope } from '@estjs/signals';

const parent = effectScope();

parent.run(() => {
  const child = effectScope(); // automatically nested under `parent`
  child.run(() => {
    // effects here belong to `child`
  });
});

parent.stop(); // also stops `child` and all its effects
```

## Detached Scopes

Pass `true` to `effectScope` to create a detached scope. A detached scope is not registered with the current active scope, so it is not disposed when the outer scope stops — its lifetime must be managed manually.

```ts
import { effectScope } from '@estjs/signals';

const outer = effectScope();

let detached;
outer.run(() => {
  detached = effectScope(true); // detached — NOT a child of `outer`
  detached.run(() => {
    // long-lived effects
  });
});

outer.stop();
// `detached` is still active; stop it yourself when done:
detached.stop();
```

## Paused Scopes

Pausing freezes effect re-execution without disposing anything:

```ts
import { effect, effectScope, signal } from '@estjs/signals';

const count = signal(0);
const scope = effectScope();

scope.run(() => {
  effect(() => console.log(count.value));
}); // logs: 0

scope.pause();
count.value = 1; // nothing logged — effects are frozen

scope.resume(); // logs: 1 — dependencies changed during the pause,
                // so the effect catches up on resume

count.value = 2; // logs: 2 — responding to changes again
```

Behaviors worth knowing (from the implementation):

- **Dependency changes are not lost while paused.** The effect still marks itself dirty; on `resume()` it re-executes once to catch up. If nothing actually changed during the pause, it does not re-run.

- **`run()` still works while paused.** Pausing only freezes dependency-change notifications; you can still execute code inside the scope.
- **Effects created while the scope is paused inherit the pause** — but their *initial* run still executes, because `effect()` / `watch()` run their body eagerly on creation. Only subsequent dependency-change re-executions are frozen until `resume()`.

## getCurrentScope

Returns the currently active `EffectScope`, or `undefined` if there is none.

```ts
import { effectScope, getCurrentScope } from '@estjs/signals';

console.log(getCurrentScope()); // undefined

const scope = effectScope();
scope.run(() => {
  console.log(getCurrentScope() === scope); // true
});
```

## onScopeDispose

Registers a cleanup callback on the current active scope. The callback runs when the scope is stopped.

```ts
import { effectScope, onScopeDispose } from '@estjs/signals';

const scope = effectScope();

scope.run(() => {
  const timer = setInterval(() => console.log('tick'), 1000);
  onScopeDispose(() => clearInterval(timer));
});

scope.stop(); // clearInterval runs
```

If called with no active scope, a development-mode warning is emitted. Pass `true` as the second argument (`failSilently`) to suppress the warning — useful in library code that may run both inside and outside a scope:

```ts
onScopeDispose(cleanup, true); // no warning when there is no active scope
```

Registering a cleanup on an already-disposed scope is dropped (with a development-mode warning), since it would never run.

## setCurrentScope

Manually replaces the active scope and returns the previous one. This is a low-level primitive — prefer `scope.run(fn)`, which restores the previous scope automatically. When using `setCurrentScope` you must restore the previous scope yourself:

```ts
import { effectScope, setCurrentScope } from '@estjs/signals';

const scope = effectScope();
const prev = setCurrentScope(scope);
try {
  // effects created here are recorded by `scope`
} finally {
  setCurrentScope(prev); // always restore
}
```

## Relationship with Component Lifecycle

In Essor, every component runs inside its own effect scope: the component's render function and all reactive effects created during setup are recorded by that scope. When the component is destroyed, its scope is stopped, which disposes all of its effects, computeds, and watchers automatically — this is why you rarely need to call `stop()` manually inside components.

Consequently, `onScopeDispose` registered during component setup fires when the component is destroyed, making it a lifecycle-agnostic way for composable functions to clean up after themselves.

Manual scopes are mainly useful outside components (e.g. app-level services) or when you need a group of effects with a lifetime shorter than the surrounding component.

## Considerations

1. **A disposed scope cannot be reused**: `run()` on a disposed scope warns and returns `undefined`; register-time cleanups on it are dropped.
2. **`pause` / `resume` are hierarchical**: they cascade to child scopes and every recorded effect.
3. **Detached scopes leak if you forget them**: nothing stops a detached scope automatically — always keep a reference and call `stop()`.
4. **Errors during disposal are contained**: if a child scope, effect, or cleanup throws while stopping, the error is logged in development and the remaining disposals still run.

## Type Definitions

```ts
function effectScope(detached?: boolean): EffectScope;

function getCurrentScope(): EffectScope | undefined;

function setCurrentScope(scope?: EffectScope): EffectScope | undefined;

function onScopeDispose(fn: () => void, failSilently?: boolean): void;

class EffectScope {
  constructor(detached?: boolean, parent?: EffectScope);

  readonly active: boolean;
  readonly isPaused: boolean;
  readonly isDisposed: boolean;

  run<T>(fn: () => T): T | undefined;
  stop(): void;
  pause(): void;
  resume(): void;
}
```
