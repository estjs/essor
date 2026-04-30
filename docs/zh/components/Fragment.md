# Fragment

`Fragment` 组件允许您在不创建额外 DOM 节点的情况下渲染多个子元素。这对于优化 DOM 结构和提高渲染性能非常有用。

## 基本用法

```jsx
import { Fragment } from '@estjs/template';

function MyComponent() {
  return (
    <Fragment>
      <h1>标题</h1>
      <p>段落 1</p>
      <p>段落 2</p>
    </Fragment>
  );
}
```

渲染结果将不包含额外的包装元素：

```html
<h1>标题</h1>
<p>段落 1</p>
<p>段落 2</p>
```

## 使用短语法

您也可以使用 JSX 的短语法 `<>...</>` 来代替 `<Fragment>...</Fragment>`：

```jsx
function MyComponent() {
  return (
    <>
      <h1>标题</h1>
      <p>段落 1</p>
      <p>段落 2</p>
    </>
  );
}
```

## 带 key 的 Fragment

当需要在列表中使用 Fragment 并且需要提供 key 时，必须使用完整的 `<Fragment>` 语法：

```jsx
import { For, Fragment } from '@estjs/template';

function TodoList({ todos }) {
  return (
    <ul>
      <For each={todos} key={(todo) => todo.id}>
        {(todo) => (
          <Fragment>
            <li>任务: {todo.title}</li>
            <li>状态: {todo.status}</li>
          </Fragment>
        )}
      </For>
    </ul>
  );
}
```

## 动态内容

Fragment 可以包含动态内容和条件渲染：

```jsx
function ConditionalContent({ showExtra }) {
  return (
    <Fragment>
      <h1>必要内容</h1>
      {showExtra && (
        <Fragment>
          <h2>额外标题</h2>
          <p>额外内容</p>
        </Fragment>
      )}
    </Fragment>
  );
}
```

## API 参考

### Props

| 属性 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `children` | `JSX.Element \| JSX.Element[] \| (() => JSX.Element \| JSX.Element[]) \| null` | - | Fragment 的子元素 |
| `key` | `string \| number` | `undefined` | 用于列表渲染时的唯一标识符 |

### 返回值

返回一个 `DocumentFragment` 实例，包含所有子元素但不会在 DOM 中创建额外节点。

## 性能优化

Fragment 组件内部使用了缓存机制，当渲染相同的静态内容时，会重用之前创建的 DOM 结构，从而提高渲染性能。

## 实现原理

Fragment 组件通过 `DocumentFragment` API 实现，它是一种轻量级的 DOM 容器，可以保存多个子节点但不会在 DOM 树中创建额外的节点。当 Fragment 被插入到 DOM 中时，只有其子节点会被添加，Fragment 本身不会出现在 DOM 结构中。

```typescript
// Fragment 组件的简化实现
export function Fragment(props: FragmentProps): DocumentFragment {
  const fragment = document.createDocumentFragment();

  // 渲染子元素到 fragment
  insert(fragment, () => props.children);

  return fragment;
}
```

## 最佳实践

- 使用 Fragment 来避免不必要的 DOM 嵌套，特别是在列表渲染和布局组件中
- 在需要返回多个元素但不想添加额外容器的情况下使用 Fragment
- 对于简单的无 key 场景，优先使用短语法 `<>...</>`
- 在需要为 Fragment 提供 key 的情况下，使用完整语法 `<Fragment key={key}>...</Fragment>`
