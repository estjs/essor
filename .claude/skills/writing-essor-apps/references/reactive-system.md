# Essor Reactive System

## $ Prefix Transform

The Babel plugin auto-transforms `$`-prefixed declarations:

| Source | Compiled | JSX Access |
|---|---|---|
| `const $x = 0` | `signal(0)` | `$x` → `() => $x.value` |
| `let $x = 0` | `signal(0)` | Same |
| `const $x = []` | `reactive([])` | `$x` → `() => $x` |
| `const $x = {}` | `reactive({})` | `$x` → `() => $x` |
| `const x = 0` | (no transform) | static value |

```tsx
// Two-way binding compiles to bindElement():
<input bind:value={$name} />        // → bindElement(input, 'value', g, s)
<input bind:value.trim={$name} />   // → bindElement(input, 'value', g, s, { trim: true })
<input bind:value.number={$age} />  // → bindElement(input, 'value', g, s, { number: true })
<input bind:value.lazy={$q} />      // → bindElement(input, 'value', g, s, { lazy: true })
<input bind:checked={$agree} />     // → bindElement(input, 'checked', g, s)
```

## signal(value)

```tsx
const count = signal(0);
count.value;    // read (tracks in effects)
count.value = 5; // write (triggers effects)

// For objects/arrays, prefer reactive() for deep tracking
```

## reactive(obj)

Deep reactive proxy. All nested access and mutation is tracked.

```tsx
const state = reactive({ user: { name: 'John' }, items: [{ id: 1 }] });
state.user.name = 'Jane';     // ✅ deeply tracked
state.items.push({ id: 2 });  // ✅ array mutation
state.items[0].id = 3;        // ✅ index assignment

// ❌ Reassignment loses the proxy:
// state = { ...state }; // DON'T do this

isReactive(state);  // true
toRaw(state);       // raw object without proxy
```

## computed(getter)

Lazy, cached derivation. Only re-evaluates when deps change.

```tsx
const doubled = computed(() => count.value * 2);
doubled.value; // cached until count changes

// With setter:
const fullName = computed({
  get: () => `${first.value} ${last.value}`,
  set: (v) => { [first.value, last.value] = v.split(' '); },
});
```

**Prefer plain functions** unless you need `.value` or shared caching:
```tsx
const doubled = () => count.value * 2; // simpler, auto-tracks in JSX
```

## effect(fn)

Auto-tracking side effect. Runs immediately, re-runs when tracked deps change.

```tsx
effect(() => {
  console.log('count:', count.value);
});

// Wait for DOM updates:
effect(() => { const v = count.value; nextTick(() => { /* DOM ready */ }); });
```

Effects created while a component/setup scope is active are recorded in that scope and disposed automatically with it. Keep timer, DOM listener, and subscription cleanup in lifecycle hooks such as `onDestroy()`.

## watch(source, cb)

Explicit old/new values.

```tsx
watch(() => count.value, (n, o) => console.log(`${o} → ${n}`));
watch([() => a.value, () => b.value], ([na, nb], [oa, ob]) => { /* ... */ });
```

## batch(fn)

Defers updates until batch completes. Effects run once with final values.

```tsx
batch(() => { count.value = 1; count.value = 2; count.value = 3; });
// effect runs once with value=3
```

## untrack(fn)

Read reactive values without tracking.

```tsx
effect(() => {
  const name = untrack(() => name.value); // won't re-run on name change
  console.log(`count=${count.value}, name=${name}`);
});
```

## nextTick(fn?)

Runs after current reactive flush. Can also `await nextTick()`.

## EffectScope

Group effects for batch disposal:

```tsx
const scope = effectScope();
scope.run(() => { effect(() => {}); effect(() => {}); });
scope.stop(); // dispose all
```
