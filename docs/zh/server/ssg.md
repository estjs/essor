# 静态站点生成 (SSG)

静态站点生成 (Static Site Generation, SSG) 允许你在构建时预先渲染页面为静态 HTML 文件。这结合了 SSR 的性能优势和静态托管的低成本、高可靠性。

## 什么是 SSG？

与 SSR 在每次请求时动态生成 HTML 不同，SSG 是在构建阶段（Build Time）生成 HTML。生成的 HTML 文件可以部署到任何静态文件服务器（如 Nginx, Vercel, Netlify）。

## createSSGComponent

在 SSG 模式下，Essor 提供了 `createSSGComponent` 来优化嵌套组件的渲染。

```typescript
import { createSSGComponent } from '@estjs/server';

function Header() {
  return <header>My Site Header</header>;
}

function Layout({ children }) {
  return (
    <div>
      {/* 静态渲染 Header */}
      {createSSGComponent(Header, {})}
      <main>{children}</main>
    </div>
  );
}
```

`createSSGComponent` 会为组件创建一个独立的渲染作用域，确保样式和状态隔离，同时生成高效的静态 HTML 结构。

## 选择性水合 (Selective Hydration)

在使用 SSG 时，页面中的很多部分（如文章内容、页脚）通常是纯静态的，不需要在客户端执行 JavaScript。 Essor 支持**选择性水合**，跳过这些静态部分的 Hydration 过程，从而减少客户端 JavaScript 的执行时间和内存占用。

```typescript
import { NoHydration } from '@estjs/server';

function BlogPost() {
  return (
    <div>
      <h1>Blog Title</h1>
      {/* 包裹在 NoHydration 中的内容将不会在客户端进行水合 */}
      <NoHydration>
        <article>
          <p>这是一段纯静态的内容，不需要交互。</p>
          <p>Essor 会在客户端跳过这部分的虚拟 DOM 生成和比对。</p>
        </article>
      </NoHydration>
    </div>
  );
}
```

这对于像博客、文档站点这样以内容为主的应用性能提升非常显著。
