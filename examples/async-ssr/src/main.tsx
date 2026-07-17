import { Suspense, inject } from 'essor';
import type { InjectionKey } from 'essor';

export interface Todo {
  id: number;
  title: string;
}

/**
 * Injection key for the page data. The SERVER entry provides it after an
 * `await` inside an async root component (renderToStringAsync keeps the
 * request scope alive across await). The CLIENT entry provides the same data
 * deserialized from `window.__ASYNC_SSR_DATA__` before hydrating.
 */
export const PageDataKey: InjectionKey<Todo[]> = Symbol('page-data');

/**
 * Fake data source with an artificial delay — stands in for a database or
 * upstream API call. Only ever invoked on the server.
 */
export async function fakeFetchTodos(): Promise<Todo[]> {
  await new Promise((resolve) => setTimeout(resolve, 120));
  return [
    { id: 1, title: 'Fetch data on the server' },
    { id: 2, title: 'Provide it after an await' },
    { id: 3, title: 'Hydrate the same markup on the client' },
  ];
}

/** Reads the injected page data. Sync — data is already resolved by the entry. */
function TodoList() {
  const todos = inject(PageDataKey, [] as Todo[]);

  return (
    <ul class="todo-list">
      {todos.map((todo) => (
        <li data-test="ssr-item">{todo.title}</li>
      ))}
    </ul>
  );
}

/** Client-side interactivity proof: works only after successful hydration. */
function Counter() {
  let $count = 0;

  return (
    <p class="counter-row">
      Counter: <span data-test="counter">{$count}</span>{' '}
      <button data-test="increment" onClick={() => $count++}>
        +1
      </button>
    </p>
  );
}

/**
 * Shared root component — identical on server and client. It is synchronous:
 * async data fetching lives in the entries, so the client can hydrate it
 * directly (an async root component cannot be hydrated).
 */
export function App() {
  return (
    <main data-test="example-root">
      <h1>Async SSR (renderToStringAsync)</h1>
      {/* Fallback as a thunk: only evaluated if it actually renders. On the
          server the compiler would otherwise evaluate an inline JSX fallback
          eagerly and consume a hydration key for markup that never ships,
          shifting every later data-hk and breaking hydration. */}
      <Suspense fallback={() => <p data-test="fallback">Loading…</p>}>
        <TodoList />
      </Suspense>
      <Counter />
    </main>
  );
}
