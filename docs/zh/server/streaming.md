# 异步 SSR (renderToStringAsync)

> **流式渲染尚未实现。** Essor 当前渲染完整页面并返回单个字符串。真正的流式（带乱序 Suspense 输出的 `renderToStream`）在路线图上——见底部[路线图](#路线图真流式)。本页记录的是**当前存在**的异步渲染能力。

## 同步 vs 异步渲染

`renderToString` 是严格同步的。如果组件返回 Promise，它会**直接抛错**——同步路径无法 await，而静默序列化 Promise 会输出损坏的 HTML：

```typescript
import { renderToString } from '@estjs/server';

const AsyncPage = async () => { /* ... */ };

renderToString(AsyncPage, {});
// Error: renderToString received a Promise - use renderToStringAsync for async components.
```

`renderToStringAsync` 是 Promise 感知的变体：

```typescript
function renderToStringAsync<P>(
  component: ComponentFn<P>,
  props?: P,
  context?: SSRContext | null
): Promise<string>
```

## 基础用法

```typescript
import { renderToStringAsync } from '@estjs/server';

async function App({ userId }) {
  const user = await fetchUser(userId);
  return (
    <main>
      <h1>Welcome, {user.name}</h1>
    </main>
  );
}

// 服务端 handler
const html = await renderToStringAsync(App, { userId: '123' });
res.setHeader('Content-Type', 'text/html');
res.end(html);
```

发送任何内容前整棵树都会被 await 完毕：**TTFB 等于最慢的数据依赖**。这是与流式相比的取舍——换来的是 HTTP 状态码完全可控（见[并发与错误](#并发与错误)）。

## 哪些内容会被 await

被 await 的组件结果会流经一条 Promise 感知的解析管线，递归透明地解包：

- `async` 组件函数（组件本身返回 Promise）
- 数组结果中嵌套的 Promise（如 `{items.map(async item => ...)}`）
- 返回 Promise 的 thunk（编译产物的惰性 children）

```typescript
async function Sections() {
  return [
    renderHeader(),            // 同步值
    fetchBody(),               // Promise<JSX>
    async () => fetchFooter(), // 返回 Promise 的 thunk
  ];
}
```

## 跨 await 的 provide / inject

请求的响应式作用域跨 `await` 边界存活（Node 上通过 `AsyncLocalStorage`），因此依赖注入在异步组件中自然可用——包括在 `await` **之后**调用的 `provide()`：

```typescript
import { provide, inject } from 'essor';

const PageDataKey = Symbol('page-data');

async function Parent() {
  const data = await loadPageData();
  provide(PageDataKey, data); // await 之后 —— 仍是请求级作用域
  return <Child />;
}

function Child() {
  const data = inject(PageDataKey);
  return <p>{data.title}</p>;
}
```

并发渲染互相不可见——见 [SSR 上下文与请求隔离](/zh/server/ssr-context)。

## Suspense 在 SSR 中的语义

在服务端，`<Suspense>` 在序列化时刻是同步的：`children` 有内容就渲染 children，只有 children 为空时才输出 `fallback`。配合 `renderToStringAsync`，数据在序列化**之前**已经 resolve，因此输出的 HTML 是最终内容——而不是 fallback：

```tsx
async function Page() {
  const todos = await fetchTodos();
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <TodoList items={todos} />
    </Suspense>
  );
}
// 输出的 HTML:todo 列表。fallback 在服务端永远不会出现。
```

客户端水合后，`Suspense` 照常接管*后续的*异步工作。

## 并发与错误

- 每次 `renderToStringAsync` 调用运行在隔离的请求作用域中：`provide()`/`inject()` 状态、hydration key、`SSRContext` 在并发渲染间零泄漏。
- 组件 reject 会**让整个渲染 Promise reject**，渲染作用域随之销毁。由于还没有发送任何内容，服务器对 HTTP 状态码保持完全控制：

```typescript
try {
  const html = await renderToStringAsync(App, props);
  res.writeHead(200, { 'Content-Type': 'text/html' }).end(html);
} catch (err) {
  res.writeHead(500).end('Internal Server Error');
}
```

这是相对流式的真实优势：一旦流以 `200` 开始发送，流中途的错误就无法再改变状态码。

## 路线图：真流式

`renderToStream` API——立即输出外壳、Suspense 边界内容 resolve 后乱序流式送达——已在规划中但**尚未实现**。不要在生产代码中引用 `renderToStream`；任何已发布版本中都不存在它。在其落地之前，`renderToStringAsync` 是服务端渲染异步组件树的受支持方式。
