import { createApp } from 'essor';

type Filter = 'all' | 'active' | 'completed';

function App() {
  let nextId = 1;
  let $draft = '';
  let $filter = 'all' as Filter;
  let $editingId = 0;
  let $editingText = '';
  const $todos = [] as { id: number; title: string; completed: boolean }[];

  const visibleTodos = () => {
    if ($filter === 'active') return $todos.filter((todo) => !todo.completed);
    if ($filter === 'completed') return $todos.filter((todo) => todo.completed);
    return $todos;
  };

  const remainingCount = () => $todos.filter((todo) => !todo.completed).length;
  const completedCount = () => $todos.filter((todo) => todo.completed).length;
  const allCompleted = () => $todos.length > 0 && remainingCount() === 0;

  const addTodo = () => {
    const title = $draft.trim();
    if (!title) return;

    $todos.push({
      id: nextId++,
      title,
      completed: false,
    });
    $draft = '';
  };

  const updateTodo = (
    id: number,
    updater: (todo: { id: number; title: string; completed: boolean }) => {
      id: number;
      title: string;
      completed: boolean;
    },
  ) => {
    const index = $todos.findIndex((todo) => todo.id === id);
    if (index < 0) return;
    $todos[index] = updater($todos[index]);
  };

  const removeTodo = (id: number) => {
    const index = $todos.findIndex((todo) => todo.id === id);
    if (index >= 0) $todos.splice(index, 1);
    if ($editingId === id) {
      $editingId = 0;
      $editingText = '';
    }
  };

  const startEdit = (id: number, title: string) => {
    $editingId = id;
    $editingText = title;
  };

  const cancelEdit = () => {
    $editingId = 0;
    $editingText = '';
  };

  const saveEdit = (id: number) => {
    const title = $editingText.trim();

    if (!title) {
      removeTodo(id);
      return;
    }

    updateTodo(id, (todo) => ({
      ...todo,
      title,
    }));
    cancelEdit();
  };

  const toggleAll = () => {
    const nextCompleted = !allCompleted();

    for (let index = 0; index < $todos.length; index++) {
      $todos[index] = {
        ...$todos[index],
        completed: nextCompleted,
      };
    }
  };

  const clearCompleted = () => {
    for (let index = $todos.length - 1; index >= 0; index--) {
      if ($todos[index].completed) $todos.splice(index, 1);
    }
  };

  const itemLabel = () => (remainingCount() === 1 ? 'item' : 'items');

  return (
    <main data-test="example-root" class="page">
      <h1>TodoMVC Example</h1>
      <p class="note">A basic todo example with add, edit, filter, toggle, and clear flows.</p>

      <section class="stack">
        <label>
          <span>New todo</span>
          <input
            data-test="new-todo"
            bind:value={$draft}
            placeholder="What needs to be done?"
            onKeyDown={(event) => event.key === 'Enter' && addTodo()}
          />
        </label>

        <div class="row">
          <button onClick={addTodo}>Add</button>
          <button data-test="toggle-all" disabled={$todos.length === 0} onClick={toggleAll}>
            Toggle all
          </button>
        </div>

        <ul class="todo-list">
          {visibleTodos().map((todo) => (
            <li
              data-test="todo-item"
              class={todo.completed ? 'todo-item is-completed' : 'todo-item'}>
              {$editingId === todo.id ? (
                <div class="todo-edit">
                  <input
                    data-test="edit-input"
                    bind:value={$editingText}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') saveEdit(todo.id);
                      if (event.key === 'Escape') cancelEdit();
                    }}
                  />
                  <button data-test="save-edit" onClick={() => saveEdit(todo.id)}>
                    Save
                  </button>
                  <button data-test="cancel-edit" onClick={cancelEdit}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div class="todo-main">
                  <input
                    data-test="todo-toggle"
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() =>
                      updateTodo(todo.id, (current) => ({
                        ...current,
                        completed: !current.completed,
                      }))
                    }
                  />
                  <span data-test="todo-title">{todo.title}</span>
                  <button data-test="todo-edit" onClick={() => startEdit(todo.id, todo.title)}>
                    Edit
                  </button>
                  <button data-test="todo-delete" onClick={() => removeTodo(todo.id)}>
                    Delete
                  </button>
                  <span>{todo.completed ? 'Completed' : 'Active'}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section class="stack">
        <p data-test="remaining-count">
          {remainingCount()} {itemLabel()} left
        </p>
        <p data-test="todo-summary">
          Total: {$todos.length} | Completed: {completedCount()}
        </p>

        <div class="filters">
          <button
            data-test="filter-all"
            aria-pressed={$filter === 'all'}
            onClick={() => ($filter = 'all')}>
            All
          </button>
          <button
            data-test="filter-active"
            aria-pressed={$filter === 'active'}
            onClick={() => ($filter = 'active')}>
            Active
          </button>
          <button
            data-test="filter-completed"
            aria-pressed={$filter === 'completed'}
            onClick={() => ($filter = 'completed')}>
            Completed
          </button>
        </div>

        <div class="row">
          <button disabled={completedCount() === 0} onClick={clearCompleted}>
            Clear completed
          </button>
        </div>
      </section>
    </main>
  );
}

createApp(App, '#app');
