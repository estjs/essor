# Suspense

`Suspense` 组件允许您在等待异步操作（如数据加载、代码分割等）完成时显示回退内容。这使得创建加载状态和处理异步依赖变得更加简单和声明式。

## 基本用法

```jsx
import { Suspense, defineAsyncComponent } from '@estjs/template';

// 懒加载组件
const LazyComponent = defineAsyncComponent(() => import('./LazyComponent'));

function App() {
  return (
    <div class="app">
      <h1>我的应用</h1>
      <Suspense fallback={<div>加载中...</div>}>
        <LazyComponent />
      </Suspense>
    </div>
  );
}
```

在这个例子中，当 `LazyComponent` 正在加载时，Suspense 组件会显示 "加载中..." 的回退内容。

## 数据获取

Suspense 也可以与 `createResource` 配合处理数据获取：

```jsx
import { Suspense, createResource } from '@estjs/template';

function UserProfile({ userId }) {
  const user = createResource(() => userId, async (id) => {
    const res = await fetch(`/api/users/${id}`);
    return res.json();
  });

  return (
    <div class="user-profile">
      <h2>{user.value().name}</h2>
      <p>{user.value().email}</p>
    </div>
  );
}

function App() {
  return (
    <div class="app">
      <h1>用户资料</h1>
      <Suspense fallback={<div>加载用户数据中...</div>}>
        <UserProfile userId="123" />
      </Suspense>
    </div>
  );
}
```

在这个例子中，当 `UserProfile` 组件正在加载数据时，Suspense 组件会显示 "加载用户数据中..." 的回退内容。数据加载完成后，会自动切换到实际的用户资料内容。

## 嵌套 Suspense

Suspense 组件可以嵌套使用，每个 Suspense 组件只处理其直接子组件的挂起状态：

```jsx
import { Suspense } from '@estjs/template';

function App() {
  return (
    <div class="app">
      <Suspense fallback={<div>加载应用中...</div>}>
        <Header />
        <Suspense fallback={<div>加载主内容中...</div>}>
          <MainContent />
        </Suspense>
        <Suspense fallback={<div>加载侧边栏中...</div>}>
          <Sidebar />
        </Suspense>
        <Footer />
      </Suspense>
    </div>
  );
}
```

在这个嵌套示例中，每个 Suspense 边界独立处理自己的加载状态。当 `MainContent` 加载时，只会显示 "加载主内容中..."，而不会影响 Header 或 Sidebar 的显示。

## 错误处理

Suspense 组件内部包含错误处理机制，当异步操作失败时，会显示回退内容并在控制台输出错误信息。您可以结合错误边界来捕获和处理这些错误：

```jsx
import { Suspense } from '@estjs/template';
import { ErrorBoundary } from './ErrorBoundary';

function App() {
  return (
    <div class="app">
      <ErrorBoundary fallback={<div>出错了！请稍后再试。</div>}>
        <Suspense fallback={<div>加载中...</div>}>
          <AsyncComponent />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
```

## API 参考

### Props

| 属性 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `children` | `JSX.Element \| JSX.Element[] \| (() => JSX.Element \| JSX.Element[]) \| null` | - | 可能会挂起的子元素 |
| `fallback` | `JSX.Element \| JSX.Element[] \| (() => JSX.Element \| JSX.Element[])` | - | 在子元素挂起时显示的回退内容 |
| `key` | `string \| number` | `undefined` | 可选的唯一标识符 |

### 辅助函数

#### suspend

```typescript
function suspend<T>(promise: Promise<T>): T;
```

`suspend` 函数用于挂起渲染，直到指定的 Promise 解决。如果 Promise 尚未解决，它会抛出该 Promise，被 Suspense 组件捕获并显示回退内容。

### 返回值

返回一个 `DocumentFragment` 实例，包含子元素或回退内容。

## 实现原理

Suspense 组件通过以下机制实现异步渲染：

1. 创建一个状态对象来跟踪挂起的 Promise
2. 尝试渲染子元素，如果子元素调用了 `suspend` 函数，会抛出一个 Promise
3. 捕获这个 Promise，注册它，并渲染回退内容
4. 当所有注册的 Promise 解决后，重新尝试渲染子元素

```typescript
// Suspense 组件的简化实现
export function Suspense(props: SuspenseProps): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const { state, register } = useSuspense();

  try {
    // 设置当前 Suspense 上下文
    suspenseContext.current = state.value;

    try {
      // 尝试渲染子元素
      if (state.value.resolved) {
        insert(fragment, () => props.children);
      } else {
        throw new Promise(resolve => {
          Promise.all(state.value.pending).finally(resolve);
        });
      }
    } catch (error) {
      if (error instanceof Promise) {
        // 注册 Promise 并显示回退内容
        register(error);
        insert(fragment, () => props.fallback);
      } else {
        throw error;
      }
    }
  } catch (error) {
    // 处理其他错误
    console.error('Suspense error:', error);
    insert(fragment, () => props.fallback);
  }

  return fragment;
}
```

## 性能优化

Suspense 组件内部使用了 Promise 缓存机制，避免重复注册相同的 Promise，从而提高性能。此外，它还使用了微任务队列来批量处理 Promise 状态更新，减少不必要的重新渲染。

## 最佳实践

- 使用 Suspense 来处理异步加载的组件和数据
- 为每个 Suspense 组件提供有意义的回退内容，提升用户体验
- 合理设置 Suspense 的边界，避免一个组件的挂起影响整个应用
- 结合错误边界来处理异步操作中的错误
- 考虑使用骨架屏或加载指示器作为回退内容，而不是简单的加载文本
