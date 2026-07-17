# 服务端渲染 (SSR)

服务端渲染 (Server-Side Rendering, SSR) 是 Essor 框架的核心特性之一。它允许你在服务端将组件渲染成 HTML 字符串，直接发送给客户端，从而提高首屏加载速度 (FCP) 和 SEO 友好性。

## 为什么选择 SSR？

- **更好的 SEO**: 搜索引擎爬虫可以直接读取服务端生成的 HTML 内容。
- **更快的首屏加载**: 用户无需等待 JavaScript 下载和执行即可看到页面内容。
- **统一的开发体验**: 使用同一套组件代码，既可以在服务端渲染，也可以在客户端运行。

## 基础用法

Essor 提供了 `renderToString` 函数来将组件渲染为 HTML 字符串。

```typescript
import { renderToString } from '@estjs/server';

function App({ title }) {
  return (
    <div>
      <h1>{title}</h1>
      <p>Hello, Essor SSR!</p>
    </div>
  );
}

// 在服务端调用
const html = renderToString(App, { title: 'My SSR App' });
console.log(html);
// 输出: <div data-hk="0"><h1 data-hk="1">My SSR App</h1><p data-hk="2">Hello, Essor SSR!</p></div>
```

## 客户端激活 (Hydration)

服务端渲染的 HTML 只是静态的标记。为了让页面具有交互性（例如响应点击事件），需要在客户端进行“激活” (Hydration)。

```typescript
import { hydrate } from 'essor';

// 客户端入口文件
hydrate(App, '#root');
```

`hydrate` 函数接收组件和目标（CSS 选择器字符串或 `Element`）。它会复用服务端生成的 DOM 节点，并附加事件监听器，使页面“活”起来。开发模式下，服务端与客户端标记不一致会以控制台警告的形式报告。

## 异步渲染

`renderToString` 是同步的，组件返回 Promise 时会抛错。`async` 组件与返回 Promise 的表达式请使用 `renderToStringAsync`——它 await 整棵树并 resolve 出最终 HTML。详见[异步 SSR](/zh/server/streaming)。真流式输出在路线图上，尚未实现。

## 转义与安全

手写组件返回的裸字符串默认会被 HTML 转义；可信的原始标记必须通过 `unsafeHTML()` 显式放行。详见[安全与转义](/zh/server/security)。

## 相关页面

- [SSR 上下文与请求隔离](/zh/server/ssr-context) —— `createSSRContext`、Portal 传送、并发渲染隔离
- [SSG](/zh/server/ssg) —— 构建期预渲染与 `createSSRComponent`
