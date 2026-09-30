/**
 * Type tests for store type inference
 * These tests verify TypeScript type checking at compile time
 */
import { expectTypeOf } from 'vitest';
import { createStore } from '../src/store';

// ============================================================================
// Options-based Store Type Inference
// ============================================================================

const useCounter = createStore({
  state: () => ({ count: 0, name: 'test' }),
  getters: {
    doubled: (state) => state.count * 2,
    message: (state) => `${state.name}: ${state.count}`,
  },
  actions: {
    increment() {
      this.count++;
    },
    setName(name: string) {
      this.name = name;
    },
  },
});

const counter = useCounter();

// State properties should be writable
expectTypeOf<number>(counter.count);
expectTypeOf<string>(counter.name);
counter.count = 5;
counter.name = 'updated';

// Getters should be readonly
expectTypeOf<number>(counter.doubled);
expectTypeOf<string>(counter.message);

// Actions should preserve their signatures
expectTypeOf<() => void>(counter.increment);
expectTypeOf<(name: string) => void>(counter.setName);

// Built-in methods should be present
expectTypeOf<object>(counter.$state);
expectTypeOf<(payload: any) => void>(counter.$patch);
expectTypeOf<() => void>(counter.$reset);
expectTypeOf<() => void>(counter.$dispose);

// ============================================================================
// Class-based Store Type Inference
// ============================================================================

class TodoStore {
  todos: Array<{ id: number; text: string; done: boolean }> = [];
  filter: 'all' | 'active' | 'completed' = 'all';

  get filtered() {
    switch (this.filter) {
      case 'active':
        return this.todos.filter((t) => !t.done);
      case 'completed':
        return this.todos.filter((t) => t.done);
      default:
        return this.todos;
    }
  }

  get count() {
    return this.todos.length;
  }

  add(text: string) {
    this.todos.push({
      id: Date.now(),
      text,
      done: false,
    });
  }

  toggle(id: number) {
    const todo = this.todos.find((t) => t.id === id);
    if (todo) todo.done = !todo.done;
  }

  remove(id: number) {
    const index = this.todos.findIndex((t) => t.id === id);
    if (index > -1) this.todos.splice(index, 1);
  }

  setFilter(filter: 'all' | 'active' | 'completed') {
    this.filter = filter;
  }
}

const useTodos = createStore(TodoStore);
const todos = useTodos();

// State properties should be writable
expectTypeOf<Array<{ id: number; text: string; done: boolean }>>(todos.todos);
expectTypeOf<'all' | 'active' | 'completed'>(todos.filter);
todos.filter = 'active';

// Getters should be readonly and inferred correctly
expectTypeOf<Array<{ id: number; text: string; done: boolean }>>(todos.filtered);
expectTypeOf<number>(todos.count);

// Actions should preserve their signatures
expectTypeOf<(text: string) => void>(todos.add);
expectTypeOf<(id: number) => void>(todos.toggle);
expectTypeOf<(id: number) => void>(todos.remove);
expectTypeOf<(filter: 'all' | 'active' | 'completed') => void>(todos.setFilter);

// Built-in methods should be present
expectTypeOf<object>(todos.$state);
expectTypeOf<(payload: any) => void>(todos.$patch);
expectTypeOf<() => void>(todos.$reset);
expectTypeOf<() => void>(todos.$dispose);

// ============================================================================
// Class with Nested State
// ============================================================================

class UserStore {
  user = {
    name: 'John',
    email: 'john@example.com',
    preferences: {
      theme: 'dark' as 'dark' | 'light',
      notifications: true,
    },
  };

  get displayName() {
    return this.user.name;
  }

  updateEmail(email: string) {
    this.user.email = email;
  }

  toggleTheme() {
    this.user.preferences.theme = this.user.preferences.theme === 'dark' ? 'light' : 'dark';
  }
}

const useUser = createStore(UserStore);
const user = useUser();

// Nested state structure should be preserved
expectTypeOf<string>(user.user.name);
expectTypeOf<string>(user.user.email);
expectTypeOf<'dark' | 'light'>(user.user.preferences.theme);
expectTypeOf<boolean>(user.user.preferences.notifications);

// Getters
expectTypeOf<string>(user.displayName);

// Actions
expectTypeOf<(email: string) => void>(user.updateEmail);
expectTypeOf<() => void>(user.toggleTheme);

// ============================================================================
// Class with Async Actions
// ============================================================================

class AsyncStore {
  data: string | null = null;
  loading = false;
  error: Error | null = null;

  get isReady() {
    return this.data !== null && !this.loading;
  }

  async fetchData() {
    this.loading = true;
    this.error = null;
    try {
      const response = await fetch('/api/data');
      this.data = await response.text();
    } catch (err) {
      this.error = err as Error;
    } finally {
      this.loading = false;
    }
  }

  reset() {
    this.data = null;
    this.loading = false;
    this.error = null;
  }
}

const useAsync = createStore(AsyncStore);
const asyncStore = useAsync();

// State types
expectTypeOf<string | null>(asyncStore.data);
expectTypeOf<boolean>(asyncStore.loading);
expectTypeOf<Error | null>(asyncStore.error);

// Getters
expectTypeOf<boolean>(asyncStore.isReady);

// Actions (async should return Promise)
expectTypeOf<() => Promise<void>>(asyncStore.fetchData);
expectTypeOf<() => void>(asyncStore.reset);

// ============================================================================
// Empty Class (Edge Case)
// ============================================================================

class EmptyStore { }

const useEmpty = createStore(EmptyStore);
const empty = useEmpty();

// Should have built-ins even with no state
expectTypeOf<object>(empty.$state);
expectTypeOf<() => void>(empty.$dispose);

// ============================================================================
// Class with Only Getters
// ============================================================================

class GettersOnlyStore {
  count = 0;

  get doubled() {
    return this.count * 2;
  }

  get tripled() {
    return this.count * 3;
  }
}

const useGettersOnly = createStore(GettersOnlyStore);
const gettersOnly = useGettersOnly();

expectTypeOf<number>(gettersOnly.count);
expectTypeOf<number>(gettersOnly.doubled);
expectTypeOf<number>(gettersOnly.tripled);

// ============================================================================
// Class with Only Actions
// ============================================================================

class ActionsOnlyStore {
  value = 0;

  increment() {
    this.value++;
  }

  decrement() {
    this.value--;
  }
}

const useActionsOnly = createStore(ActionsOnlyStore);
const actionsOnly = useActionsOnly();

expectTypeOf<number>(actionsOnly.value);
expectTypeOf<() => void>(actionsOnly.increment);
expectTypeOf<() => void>(actionsOnly.decrement);
