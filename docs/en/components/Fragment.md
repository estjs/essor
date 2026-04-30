# Fragment

The `Fragment` component lets you render multiple children without creating extra DOM nodes. This is useful for keeping DOM structures flat and avoiding unnecessary wrapper elements.

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

Rendered result contains no extra wrapper:

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

When using Fragment inside a list and a `key` is required, use the full `<Fragment>` syntax:

```tsx
function TodoList({ todos }) {
  return (
    <ul>
      {todos.map(todo => (
        <Fragment key={todo.id}>
          <li>Task: {todo.title}</li>
          <li>Status: {todo.status}</li>
        </Fragment>
      ))}
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
      <h1>Required Content</h1>
      {showExtra && (
        <>
          <h2>Extra Title</h2>
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
| `key` | `string \| number` | `undefined` | Unique identifier for list rendering |

## Best Practices

- Use Fragment to avoid unnecessary DOM nesting, especially in lists and layout components
- Prefer the shorthand `<>...</>` for simple cases without a key
- Use the full `<Fragment key={key}>...</Fragment>` syntax when a key is needed
