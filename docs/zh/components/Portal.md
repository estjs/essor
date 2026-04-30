# Portal

`Portal` 组件允许您将子元素渲染到 DOM 树中的任何位置，而不受父组件 DOM 层次结构的限制。这对于创建模态框、弹出菜单、通知等覆盖在页面其他部分之上的 UI 元素非常有用。

## 基本用法

```jsx
import { Portal } from '@estjs/template';

function Modal({ isOpen, onClose, children }) {
  if (!isOpen) return null;

  return (
    <Portal container={document.body}>
      <div class="modal-overlay" onClick={onClose}>
        <div class="modal-content" onClick={e => e.stopPropagation()}>
          {children}
          <button onClick={onClose}>关闭</button>
        </div>
      </div>
    </Portal>
  );
}
```

在这个例子中，无论 `Modal` 组件在组件树中的位置如何，模态框内容都会被渲染到 `document.body` 中。

## 动态容器

Portal 的容器可以是任何 DOM 元素，也可以动态获取：

```jsx
import { Portal } from '@estjs/template';
import { useEffect, useRef, useState } from 'react';

function Tooltip({ content, targetId }) {
  const [container, setContainer] = useState(null);

  useEffect(() => {
    const targetElement = document.getElementById(targetId);
    if (targetElement) {
      setContainer(targetElement);
    }
  }, [targetId]);

  if (!container) return null;

  return (
    <Portal container={container}>
      <div class="tooltip">{content}</div>
    </Portal>
  );
}
```

## 事件冒泡

需要注意的是，通过 Portal 渲染的元素虽然在 DOM 结构上与父组件分离，但事件仍然会按照组件树的层次结构进行冒泡。

## 多个 Portal

您可以在同一个组件中使用多个 Portal，将内容渲染到不同的容器中：

```jsx
function SplitContent() {
  return (
    <div>
      <h1>主内容</h1>
      <Portal container={document.querySelector('#sidebar')}>
        <nav>侧边栏导航</nav>
      </Portal>
      <Portal container={document.querySelector('#footer')}>
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
| `children` | `JSX.Element \| JSX.Element[] \| (() => JSX.Element \| JSX.Element[]) \| null` | - | 要传送到目标容器的内容 |
| `container` | `Element` | - | 目标容器元素，内容将被渲染到这个元素中 |
| `key` | `string \| number` | `undefined` | 可选的唯一标识符 |

### 返回值

Portal 组件不返回可见内容到其在组件树中的位置，而是将内容渲染到指定的容器中。

## 实现原理

Portal 组件通过以下步骤实现：

1. 创建一个新的渲染上下文
2. 将子元素渲染到指定的容器中
3. 为每个渲染的节点添加标记，以便在组件卸载时能够正确清理
4. 注册卸载钩子，确保在组件卸载时清理所有渲染的内容

```typescript
// Portal 组件的简化实现
export function Portal(props: PortalProps): void {
  const context = createContext();

  // 在指定容器中渲染子元素
  withContext(context, () => {
    insert(props.container, () => props.children);
  });

  // 注册卸载钩子，清理渲染的内容
  onDestroy(() => {
    // 清理逻辑
  });
}
```

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
