# Essor State Management

## createStore — Options-Based

```tsx
import { createStore } from 'essor';

const useCounter = createStore({
  state: { count: 0, history: [] as number[] },
  getters: {
    double: (s) => s.count * 2,
    lastAction: (s) => s.history[s.history.length - 1] ?? null,
  },
  actions: {
    increment() { this.history.push(this.count); this.count++; },
    reset() { this.count = 0; this.history = []; },
  },
});

function Counter() {
  const store = useCounter();
  return <button onClick={() => store.increment()}>{store.count}</button>;
}
```

- State accessed as `store.property` (reactive getter)
- Setting `store.property = v` is reactive
- `this` in getters/actions = reactive store instance
- Actions can be async: `async fetch() { this.data = await api.get() }`

## createStore — Class-Based

```tsx
class CounterStore {
  count = 0;
  get double() { return this.count * 2; }
  increment() { this.count++; }
}
const useCounter = createStore(CounterStore);
```

Rules: instance properties → state, `get` accessors → computed getters, methods → actions.

## Built-in Store Methods

```tsx
const s = useCounter();

s.patch$({ count: 10, history: [] });          // batch update
s.subscribe$((state) => {}); s.unsubscribe$(); // watch state
s.onAction$((state) => {}); s.offAction$();    // watch actions
s.reset$();                                     // restore initial
```

## provide / inject

```tsx
import { provide, inject, type InjectionKey } from 'essor';

const ThemeKey: InjectionKey<string> = Symbol('theme');

// Provider:
provide(ThemeKey, 'dark');

// Consumer (any descendant):
const theme = inject(ThemeKey, 'light'); // 'dark' if provided, else 'light'
```

- Use `Symbol` for collision-free keys
- `provide` flows downward only (parent → child)
- `inject` traverses UP the scope chain

## createResource — Async Data

```tsx
import { createResource } from 'essor';

const [data, { mutate, refetch }] = createResource(
  () => fetch('/api/data').then(r => r.json()),
  { initialValue: null }
);

data();           // T | undefined (accessor)
data.loading;     // Signal<boolean>
data.error;       // Signal<Error | null>
data.state;       // Signal<'pending' | 'ready' | 'errored'>

mutate(newData);  // optimistic update — sets immediately
refetch();        // re-run fetcher
```

### Loading States

```tsx
<Suspense fallback={<Skeleton />}>
  {data.state.value === 'errored' && <ErrorBanner error={data.error.value} />}
  {data.loading.value && <Spinner />}
  <div>{data()?.name}</div>
</Suspense>
```

### Optimistic Updates

```tsx
const addTodo = async (title: string) => {
  const newTodo = { id: Date.now(), title, done: false };
  mutate([...data() ?? [], newTodo]); // show immediately
  await fetch('/api/todos', { method: 'POST', body: JSON.stringify(newTodo) });
  refetch(); // sync with server
};
```

### Refetch on Change

```tsx
watch(() => userId, () => refetch());
// or: let the fetcher close over reactive deps — resource re-runs automatically in reactive context
```

## Choosing State

| Scenario | Solution |
|---|---|
| Local state | `let $x = v` |
| Derived values | `const f = () => $x + 1` |
| Shared state | `createStore` |
| Pass down tree | `provide`/`inject` |
| Server data | `createResource` |
| Cross-cutting (theme/auth) | `provide` at root |
