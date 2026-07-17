# 静态站点生成 (SSG)

静态站点生成 (Static Site Generation, SSG) 允许你在构建时预先渲染页面为静态 HTML 文件。这结合了 SSR 的性能优势和静态托管的低成本、高可靠性。

## 什么是 SSG？

与 SSR 在每次请求时动态生成 HTML 不同，SSG 是在构建阶段（Build Time）生成 HTML。生成的 HTML 文件可以部署到任何静态文件服务器（如 Nginx, Vercel, Netlify）。

## createSSRComponent

在 SSG/SSR 模式下，Essor 提供了 `createSSRComponent` 将组件子树渲染为 HTML 字符串。

```typescript
import { createSSRComponent } from '@estjs/server';

function Header() {
  return <header>My Site Header</header>;
}

function Layout({ children }) {
  return (
    <div>
      {/* 静态渲染 Header */}
      {createSSRComponent(Header, {})}
      <main>{children}</main>
    </div>
  );
}
```

`createSSRComponent` 会在继承当前活动作用域的子作用域中执行组件，因此组件内的 `inject()` 可以取到祖先 `provide()` 的值，而组件内部的 `provide()` 只作用于自身子树。

其返回值是一个**品牌化的 SSR 节点**：内容已经过安全序列化（内部的裸字符串已被 HTML 转义），因此穿越父组件边界时不会被二次转义。对其调用 `String()` 即可得到渲染后的 HTML。转义契约详见[安全与转义](/zh/server/security)。

> `ssrComponent` 是 `createSSRComponent` 的别名，仅为编译产物的稳定性而保留；手写代码请使用 `createSSRComponent`。

## 路线图：选择性水合 (Selective Hydration)

跳过纯静态区域（如文章正文、页脚）的客户端水合在路线图上，但**尚未实现**——当前没有 `NoHydration` 组件或等价 API。目前整棵预渲染树都会由 `hydrate()` 完成水合。
