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
import { hydrate } from '@estjs/server';

// 客户端入口文件
hydrate(App, '#root', {
  // 可选配置
  detectMismatches: true, // 开发环境下检测服务端和客户端渲染是否一致
});
```

`hydrate` 函数会复用服务端生成的 DOM 节点，并附加事件监听器，使页面“活”起来。

## 流式渲染 (Streaming)

除了 `renderToString`，Essor 还支持流式渲染，允许通过 HTTP 响应流渐进式发送 HTML 内容。这对于缩短 Time-To-First-Byte (TTFB) 非常有效。

详细内容请参考 [API 文档](../api/api)。
