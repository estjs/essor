# Portal

`Portal` 组件允许您将子元素渲染到 DOM 树中的任何位置，而不受父组件 DOM 层次结构的限制。这对于创建模态框、弹出菜单、通知等覆盖在页面其他部分之上的 UI 元素非常有用。

## 基本用法

```tsx
import { Portal } from '@estjs/template';

function Modal({ onClose, children }) {
  return (
    <Portal target={document.body}>
      <div class="modal-overlay" onClick={onClose}>
        <div class="modal-content" onClick={e => e.stopPropagation()}>
          {children}
          <button onClick={onClose}>关闭</button>
        </div>
      </div>
    </Portal>
  );
}

function App() {
  const $isOpen = false;

  return (
    <>
      <button onClick={() => ($isOpen = true)}>打开模态框</button>
      {() => $isOpen && <Modal onClose={() => ($isOpen = false)}>你好 Essor</Modal>}
    </>
  );
}
```

在这个例子中，无论 `Modal` 组件在组件树中的位置如何，模态框内容都会被渲染到 `document.body` 中。`$isOpen` 由 Essor 的编译器自动转换为 `signal`，赋值即可触发重新渲染，无需 `useState`。

## 动态目标

`target` 既可以是一个 `Element`，也可以是 CSS 选择器字符串，或者一个返回元素/选择器的 **getter 函数**。当 getter 依赖的信号发生变化时，Portal 会自动重新挂载到新的目标节点：

```tsx
import { Portal } from '@estjs/template';

function Tooltip({ content }: { content: string }) {
  // 使用 $ 前缀，编译器会自动转换为 signal
  const $targetId = 'tooltip-anchor';

  return (
    <>
      <button onClick={() => ($targetId = 'another-anchor')}>切换锚点</button>
      {/* 传入 getter 让 target 保持响应式 */}
      <Portal target={() => `#${$targetId}`}>
        <div class="tooltip">{content}</div>
      </Portal>
    </>
  );
}
```

你也可以直接传入字符串选择器：

```tsx
<Portal target="#sidebar">
  <nav>侧边栏导航</nav>
</Portal>
```

## 禁用 Portal

通过 `disabled` 属性可以让 Portal 在原位置渲染，常用于响应式布局或服务端渲染场景。`disabled` 同样支持 getter，可与信号联动：

```tsx
import { Portal } from '@estjs/template';

function ResponsiveDialog({ children }) {
  const $isMobile = window.matchMedia('(max-width: 768px)').matches;

  return (
    <Portal target={document.body} disabled={() => $isMobile}>
      <div class="dialog">{children}</div>
    </Portal>
  );
}
```

## 事件冒泡

需要注意的是，通过 Portal 渲染的元素虽然在 DOM 结构上与父组件分离，但事件仍然会按照组件树的层次结构进行冒泡。

## 多个 Portal

您可以在同一个组件中使用多个 Portal，将内容渲染到不同的容器中：

```tsx
function SplitContent() {
  return (
    <div>
      <h1>主内容</h1>
      <Portal target="#sidebar">
        <nav>侧边栏导航</nav>
      </Portal>
      <Portal target="#footer">
        <footer>页脚内容</footer>
      </Portal>
    </div>
  );
}
```

## 自动清理

Portal 组件会自动处理清理工作。当包含 Portal 的组件卸载时，Portal 渲染的内容也会被从 DOM 中移除。

## API 参考

### Props

| 属性 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `children` | `JSX.Element \| JSX.Element[] \| null` | - | 要传送到目标容器的内容 |
| `target` | `string \| Element \| (() => string \| Element \| null \| undefined)` | - | 目标容器，可传入 CSS 选择器、`Element`，或返回它们的 getter；getter 依赖的信号变化时会自动重新挂载 |
| `disabled` | `boolean \| (() => boolean)` | `false` | 为 `true` 时在原位置渲染，不再传送到 `target` |

### 返回值

Portal 在组件树中的占位是一个注释节点，真正的内容会被渲染到 `target` 指定的容器中。


## 常见用例

Portal 组件常用于以下场景：

- **模态框和对话框**：渲染在页面顶层，避免 z-index 和定位问题
- **工具提示和弹出菜单**：可以渲染在任何元素附近，不受父元素的 overflow 属性限制
- **通知和提示**：渲染在页面固定位置，不受应用布局影响
- **浮动元素**：如固定在视口中的导航栏、聊天窗口等
- **第三方容器集成**：将内容渲染到应用外部的 DOM 元素中

## 最佳实践

- 使用 Portal 来解决 CSS 上下文和布局限制问题
- 确保为 Portal 提供有效的容器元素
- 注意事件冒泡的行为，可能需要手动阻止事件传播
- 避免在 Portal 中过度使用状态管理，尽量保持 Portal 内容的简单性
- 考虑可访问性问题，确保 Portal 内容对屏幕阅读器友好
