# Fragment

The `Fragment` component lets you render multiple children without creating any extra DOM node. It keeps the DOM flat and avoids unnecessary wrapper elements.

## Basic Usage

```tsx
import { Fragment } from '@estjs/template';

function MyComponent() {
  return (
    <Fragment>
      <h1>Title</h1>
      <p>Paragraph 1</p>
      <p>Paragraph 2</p>
    </Fragment>
  );
}
```

The rendered output contains no extra wrapper:

```html
<h1>Title</h1>
<p>Paragraph 1</p>
<p>Paragraph 2</p>
```

## Shorthand Syntax

You can also use the JSX shorthand `<>...</>` instead of `<Fragment>...</Fragment>`:

```tsx
function MyComponent() {
  return (
    <>
      <h1>Title</h1>
      <p>Paragraph 1</p>
      <p>Paragraph 2</p>
    </>
  );
}
```

## Keyed Fragment

When you need a `key` (typically inside a list), use the full `<Fragment>` form. The shorthand `<>...</>` cannot accept props.

```tsx
import { For, Fragment } from '@estjs/template';

function TodoList({ todos }) {
  return (
    <ul>
      <For each={todos} key={todo => todo.id}>
        {todo => (
          <Fragment>
            <li>Task: {todo.title}</li>
            <li>Status: {todo.status}</li>
          </Fragment>
        )}
      </For>
    </ul>
  );
}
```

## Dynamic Content

Fragment supports dynamic content and conditional rendering:

```tsx
function ConditionalContent({ showExtra }) {
  return (
    <Fragment>
      <h1>Required content</h1>
      {showExtra && (
        <>
          <h2>Extra title</h2>
          <p>Extra content</p>
        </>
      )}
    </Fragment>
  );
}
```

## API

### Props

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `JSX.Element \| JSX.Element[] \| null` | - | Fragment children |
| `key` | `string \| number` | `undefined` | Unique identifier used by list renderers |

### Return Value

`Fragment` returns its children directly — no wrapper element is inserted into the DOM. An empty `<Fragment />` or `<Fragment>{null}</Fragment>` renders nothing.


The template runtime handles arrays, signals, and nested components for you, so Fragment never needs to allocate a real `DocumentFragment` at runtime. The `FRAGMENT_COMPONENT` symbol is only used by the hydration system to recognize fragment boundaries.

## Best Practices

- Use Fragment to avoid unnecessary DOM nesting, especially in lists and layout components
- Prefer the shorthand `<>...</>` for simple cases without a key
- Use the full `<Fragment key={key}>...</Fragment>` syntax when a key is required
- When returning multiple elements from a component, prefer Fragment over wrapping with a `<div>` to keep semantics intact
