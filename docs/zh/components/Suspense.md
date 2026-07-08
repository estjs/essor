# Suspense

`Suspense` 组件允许你在等待异步操作（数据加载、代码分割、懒加载组件等）完成时显示回退内容，让加载状态变得声明式，也让异步依赖更易于推理。

## 基本用法

配合 `defineAsyncComponent` 使用，处理懒加载组件：

```tsx
import { Suspense, defineAsyncComponent } from '@estjs/template';

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

`LazyComponent` 加载期间，Suspense 会显示 `fallback`；模块加载完成后自动切换到真正的组件。

## 数据获取

Suspense 与 `createResource` 天然配合 —— 资源会把待处理的 Promise 注册到最近的 Suspense 边界上，直到数据返回前一直显示 fallback：

```tsx
import { Suspense, createResource } from '@estjs/template';

function UserProfile({ userId }: { userId: string }) {
  const [user] = createResource(async (signal) => {
    const res = await fetch(`/api/users/${userId}`, { signal });
    if (!res.ok) throw new Error('Failed to load user');
    return res.json();
  });

  return (
    <div class="user-profile">
      <h2>{user()?.name}</h2>
      <p>{user()?.email}</p>
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

`createResource` 返回 `[resource, actions]` 元组。`resource` 是可调用的 —— `user()` 返回当前值（pending 时为 `undefined`）。同时还能拿到 `actions.refetch()` 与 `actions.mutate(value)`。把框架传入的 `AbortSignal` 传给 `fetch`，可以在 refetch 或组件卸载时取消过期请求。

## 嵌套 Suspense

Suspense 可以嵌套使用，每个边界只处理自己的子树，因此慢加载的组件不会拖慢整个页面：

```tsx
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

当 `MainContent` 仍在加载时，只会显示主内容区的 fallback，`Header`、`Sidebar` 与 `Footer` 都能正常渲染。

## 错误处理

异步操作可能失败，配合错误边界可以优雅地恢复：

```tsx
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

如果需要更细粒度的控制，也可以直接读取资源的 `error` 与 `state` 信号：

```tsx
const [user] = createResource(/* ... */);

return (
  <>
    {() => user.error.value && <p>请求失败：{user.error.value.message}</p>}
    {() => user.state.value === 'ready' && <Profile user={user()!} />}
  </>
);
```

## API 参考

### Props

| 属性 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `children` | `Node \| Node[] \| Promise<Node \| Node[]>` | - | 可能挂起的子元素 |
| `fallback` | `Node \| Node[]` | - | 子元素挂起时显示的回退内容 |
| `key` | `string` | `undefined` | 可选的唯一标识符 |

## 最佳实践

- 使用 Suspense 来处理异步组件与资源加载
- 为每个 Suspense 边界提供有意义的回退内容
- 合理拆分边界，避免一个慢请求阻塞整个页面
- 与错误边界配合，避免请求失败导致页面卡在 fallback
- 优先使用骨架屏或加载指示器作为 fallback，而不是简单的「加载中」文字
