import 'todomvc-app-css/index.css';

type Filter = 'all' | 'active' | 'completed';

interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

const seed: Todo[] = [
  { id: 1, title: 'Learn Essor signals', completed: true },
  { id: 2, title: 'Render todos on the server', completed: false },
  { id: 3, title: 'Hydrate the same markup on the client', completed: false },
];

export function App() {
  let nextId = seed.reduce((max, todo) => Math.max(max, todo.id), 0) + 1;
  let $draft = '';
  let $filter = 'all' as Filter;
  let $editingId = 0;
  let $editingText = '';
  const $todos = seed.map((todo) => ({ ...todo })) as Todo[];

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

  const updateTodo = (id: number, updater: (todo: Todo) => Todo) => {
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
    <section class="todoapp" data-test="example-root">
      <header class="header">
        <h1>TodoMVC</h1>
        <div class="new-todo-wrapper" style="display: flex; position: relative;">
          <input
            class="new-todo"
            data-test="new-todo"
            bind:value={$draft}
            placeholder="What needs to be done?"
            onKeyDown={(event) => event.key === 'Enter' && addTodo()}
            autofocus
            style="flex: 1;"
          />
          <button class="add-btn" onClick={addTodo} style="height: 65px; padding: 0 16px; background: rgba(0, 0, 0, 0.05); border: none; font-size: 16px; cursor: pointer;">
            Add
          </button>
        </div>
      </header>

      <section class="main">
        <input
          id="toggle-all"
          class="toggle-all"
          type="checkbox"
          checked={allCompleted()}
          onChange={toggleAll}
        />
        <label for="toggle-all" data-test="toggle-all">
          Mark all as complete
        </label>

        <ul class="todo-list">
          {visibleTodos().map((todo) => (
            <li
              data-test="todo-item"
              class={
                (todo.completed ? 'completed' : '') + ($editingId === todo.id ? ' editing' : '')
              }>
              {$editingId === todo.id ? (
                <div class="edit-wrapper">
                  <input
                    class="edit"
                    data-test="edit-input"
                    bind:value={$editingText}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') saveEdit(todo.id);
                      if (event.key === 'Escape') cancelEdit();
                    }}
                    autofocus
                  />
                  <div class="edit-actions">
                    <button
                      class="save-edit-btn"
                      data-test="save-edit"
                      onClick={() => saveEdit(todo.id)}>
                      Save
                    </button>
                    <button class="cancel-edit-btn" data-test="cancel-edit" onClick={cancelEdit}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div class="view">
                  <input
                    class="toggle"
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
                  <label data-test="todo-title" onDblClick={() => startEdit(todo.id, todo.title)}>
                    {todo.title}
                  </label>
                  <button
                    class="edit-btn"
                    data-test="todo-edit"
                    onClick={() => startEdit(todo.id, todo.title)}>
                    Edit
                  </button>
                  <button
                    class="destroy"
                    data-test="todo-delete"
                    onClick={() => removeTodo(todo.id)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <footer class="footer">
        <span class="todo-count" data-test="remaining-count">
          <strong>{remainingCount()}</strong> {itemLabel()} left
        </span>
        <ul class="filters">
          <li>
            <a
              href="#/"
              data-test="filter-all"
              class={$filter === 'all' ? 'selected' : ''}
              onClick={() => ($filter = 'all')}>
              All
            </a>
          </li>
          <li>
            <a
              href="#/active"
              data-test="filter-active"
              class={$filter === 'active' ? 'selected' : ''}
              onClick={() => ($filter = 'active')}>
              Active
            </a>
          </li>
          <li>
            <a
              href="#/completed"
              data-test="filter-completed"
              class={$filter === 'completed' ? 'selected' : ''}
              onClick={() => ($filter = 'completed')}>
              Completed
            </a>
          </li>
        </ul>
        {completedCount() > 0 && (
          <button class="clear-completed" onClick={clearCompleted}>
            Clear completed
          </button>
        )}
      </footer>

      <footer class="info">
        <p>Double-click to edit a todo</p>
        <p>Created by the Essor Team</p>
        <p>
          Part of <a href="http://todomvc.com">TodoMVC</a>
        </p>
      </footer>
    </section>
  );
}
