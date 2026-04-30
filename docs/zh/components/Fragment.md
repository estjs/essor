# Fragment

`Fragment` 组件允许你在不创建额外 DOM 节点的情况下渲染多个子元素，保持 DOM 结构扁平，避免无谓的包装元素。

## 基本用法

```tsx
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

渲染结果不包含任何额外的包装元素：

```html
<h1>标题</h1>
<p>段落 1</p>
<p>段落 2</p>
```

## 使用短语法

你也可以使用 JSX 的短语法 `<>...</>` 来代替 `<Fragment>...</Fragment>`：

```tsx
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

当需要传入 `key`（通常在列表渲染中）时，必须使用完整的 `<Fragment>` 语法，因为短语法 `<>...</>` 无法接收 props：

```tsx
import { For, Fragment } from '@estjs/template';

function TodoList({ todos }) {
  return (
    <ul>
      <For each={todos} key={todo => todo.id}>
        {todo => (
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

Fragment 支持动态内容和条件渲染：

```tsx
function ConditionalContent({ showExtra }) {
  return (
    <Fragment>
      <h1>必要内容</h1>
      {showExtra && (
        <>
          <h2>额外标题</h2>
          <p>额外内容</p>
        </>
      )}
    </Fragment>
  );
}
```

## API 参考

### Props

| 属性 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `children` | `JSX.Element \| JSX.Element[] \| null` | - | Fragment 的子元素 |
| `key` | `string \| number` | `undefined` | 列表渲染时使用的唯一标识符 |

### 返回值

`Fragment` 直接返回它的子元素，不会向 DOM 中插入任何包装节点。`<Fragment />` 或 `<Fragment>{null}</Fragment>` 不会渲染任何内容。


模板运行时会自动处理数组、信号以及嵌套组件，因此 Fragment 在运行时**并不需要**真正创建 `DocumentFragment`。`FRAGMENT_COMPONENT` 符号仅用于水合（hydration）系统识别 fragment 边界。

## 最佳实践

- 使用 Fragment 来避免不必要的 DOM 嵌套，特别是在列表渲染和布局组件中
- 简单且不需要 key 的场景，优先使用短语法 `<>...</>`
- 需要为 Fragment 提供 key 时，使用完整语法 `<Fragment key={key}>...</Fragment>`
- 当组件需要返回多个元素时，优先使用 Fragment 而不是包一层 `<div>`，以保持语义清晰
