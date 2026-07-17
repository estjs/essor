# SSR 上下文与请求隔离

`SSRContext` 收集单次渲染中树外的输出（如 Portal 传送内容）与用户元数据。配合请求级状态隔离，它让并发 SSR 变得安全。

## createSSRContext / getSSRContext

```typescript
import { createSSRContext, getSSRContext, renderToString } from '@estjs/server';

const ctx = createSSRContext();
const html = renderToString(App, {}, ctx);

// 本次渲染期间 Portal 的内容按目标收集:
ctx.teleports; // { '#modal-root': '<div>modal content</div>', ... }
```

`getSSRContext()` 在组件树内部任意位置（包括异步组件 `await` 之后）返回**当前渲染**的上下文；在渲染之外或未传入上下文时返回 `null`：

```typescript
import { getSSRContext } from '@estjs/server';

function Head() {
  const ctx = getSSRContext();
  if (ctx) {
    // 自由键值袋:收集服务端外壳需要的任何信息
    ctx.title = 'My Page';
  }
  return null;
}
```

### SSRContext 结构

```typescript
interface SSRContext {
  /** Portal 目标选择器 → 拼接后的 HTML。由调用方将每一项内联进
      最终文档(如替换外壳模板中的占位符)。 */
  teleports: Record<string, string>;
  /** 自由键值袋,存放每次渲染的元数据
      (收集的 <head> 标签、状态码、响应头等)。 */
  [key: string]: unknown;
}
```

## Teleports

`<Portal>` 的内容不能内联输出——它属于文档的其他位置。SSR 期间每个 portal 把自己的 HTML 追加到 `context.teleports[target]`，由你的服务器整合：

```typescript
const ctx = createSSRContext();
const appHtml = renderToString(App, {}, ctx);

const page = shellTemplate
  .replace('<!--app-->', appHtml)
  .replace('<!--modals-->', ctx.teleports['#modal-root'] ?? '');
```

## 请求隔离(并发)

SSR 状态——活动的 `provide()`/`inject()` 作用域、hydration key 计数器、以及 SSR 上下文本身——都是**请求级**的。在 Node 上，Essor 通过 `AsyncLocalStorage` 让这些状态跨 `await` 边界存活，因此并发的 `renderToStringAsync` 调用互不可见：

```typescript
// 两个交错的请求:各自只看到自己的 provide() 值
// 和自己的 hydration key 序列。
const [a, b] = await Promise.all([
  renderToStringAsync(PageA, {}, createSSRContext()),
  renderToStringAsync(PageB, {}, createSSRContext()),
]);
```

关键保证（由并发测试套件覆盖）：

- 请求 A 中的 `provide()` 永远不会被请求 B 的 `inject()` 看到
- Hydration key（`data-hk`）每次渲染从 0 开始——顺序或并发渲染之间零泄漏
- 请求作用域在序列化期间对惰性 thunk 保持存活（编译后的 children 在组件函数返回后才求值）
- 渲染中途写入的 `SSRContext` 元数据只属于自己的渲染

> 在没有 `AsyncLocalStorage` 的平台上，上下文退化为仅同步的兜底——`renderToString`（同步）仍完全隔离；那里不支持并发的*异步*渲染。

## 相关阅读

- [SSR 基础](/zh/server/ssr)
- [异步 SSR](/zh/server/streaming)
- [安全与转义](/zh/server/security)
