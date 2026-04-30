# 流式渲染 (Streaming SSR)

## 概述

流式渲染允许你渐进式地发送 HTML 到客户端，而不是等待整个页面渲染完成。配合 Suspense 边界，可以实现乱序流式渲染，让用户尽快看到内容。

## renderToStream

将组件渲染为可读流，支持乱序流式渲染。

### 类型签名

```typescript
function renderToStream<P>(
  component: ComponentFn<P>,
  props: P
): ReadableStream<Uint8Array>
```

### 基础用法

```typescript
import { Readable } from 'node:stream'
import { renderToStream } from '@estjs/server'
import App from './App'

// Node.js

const stream = renderToStream(App, { userId: '123' })
const nodeStream = Readable.fromWeb(stream)

nodeStream.pipe(res)

// 或使用 Web Streams API
const response = new Response(stream, {
  headers: {
    'Content-Type': 'text/html',
    'Transfer-Encoding': 'chunked'
  }
})
```

## 工作原理

### 渲染流程

```
1. 同步内容立即渲染并发送
   ↓
2. 遇到 Suspense 边界
   ↓
3. 渲染 fallback 并继续
   ↓
4. 异步内容准备好
   ↓
5. 发送 <template> + 替换脚本
   ↓
6. 所有边界完成，关闭流
```

### 示例

```typescript
// App.tsx
import { Suspense } from 'essor'

function App() {
  return (
    <html>
      <head>
        <title>My App</title>
      </head>
      <body>
        <header>
          <h1>My App</h1>
        </header>
        
        {/* 同步内容，立即发送 */}
        <nav>
          <a href="/">Home</a>
          <a href="/about">About</a>
        </nav>
        
        {/* 异步内容，先显示 fallback */}
        <Suspense fallback={<div>Loading user...</div>}>
          <UserProfile userId="123" />
        </Suspense>
        
        {/* 另一个异步边界，独立解析 */}
        <Suspense fallback={<div>Loading posts...</div>}>
          <PostList />
        </Suspense>
        
        <footer>
          <p>© 2024 My App</p>
        </footer>
      </body>
    </html>
  )
}

// UserProfile.tsx
function UserProfile({ userId }) {
  const [user] = createResource(() => 
    fetch(`/api/users/${userId}`).then(r => r.json())
  )
  
  return <div>Welcome, {user()!.name}!</div>
}

// PostList.tsx
function PostList() {
  const [posts] = createResource(() => 
    fetch('/api/posts').then(r => r.json())
  )
  
  return (
    <ul>
      {posts()!.map(post => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

### 渲染输出

**初始 HTML（立即发送）**：
```html
<html>
  <head><title>My App</title></head>
  <body>
    <header><h1>My App</h1></header>
    <nav>
      <a href="/">Home</a>
      <a href="/about">About</a>
    </nav>
    
    <!-- Suspense 边界 1 -->
    <div data-suspense-id="suspense-1">
      <div>Loading user...</div>
    </div>
    
    <!-- Suspense 边界 2 -->
    <div data-suspense-id="suspense-2">
      <div>Loading posts...</div>
    </div>
    
    <footer><p>© 2024 My App</p></footer>
  </body>
</html>
```

**用户数据准备好（乱序发送）**：
```html
<template id="suspense-1-content">
  <div>Welcome, John!</div>
</template>
<script>
  (function() {
    const template = document.getElementById('suspense-1-content')
    const target = document.querySelector('[data-suspense-id="suspense-1"]')
    target.replaceWith(template.content.cloneNode(true))
  })()
</script>
```

**文章列表准备好（乱序发送）**：
```html
<template id="suspense-2-content">
  <ul>
    <li>Post 1</li>
    <li>Post 2</li>
  </ul>
</template>
<script>
  (function() {
    const template = document.getElementById('suspense-2-content')
    const target = document.querySelector('[data-suspense-id="suspense-2"]')
    target.replaceWith(template.content.cloneNode(true))
  })()
</script>
```

## Suspense 集成

### 基础 Suspense

```typescript
import { Suspense } from 'essor'

function MyComponent() {
  return (
    <Suspense fallback={<Loading />}>
      <AsyncContent />
    </Suspense>
  )
}
```

### 嵌套 Suspense

```typescript
function App() {
  return (
    <Suspense fallback={<div>Loading app...</div>}>
      <Header />
      
      <Suspense fallback={<div>Loading sidebar...</div>}>
        <Sidebar />
      </Suspense>
      
      <main>
        <Suspense fallback={<div>Loading content...</div>}>
          <Content />
        </Suspense>
      </main>
    </Suspense>
  )
}
```

### 多个异步资源

```typescript
function Dashboard() {
  const [user] = createResource(() => fetchUser())
  const [stats] = createResource(() => fetchStats())
  const [notifications] = createResource(() => fetchNotifications())
  
  return (
    <div>
      <Suspense fallback={<div>Loading user...</div>}>
        <UserCard user={user()} />
      </Suspense>
      
      <Suspense fallback={<div>Loading stats...</div>}>
        <StatsPanel stats={stats()} />
      </Suspense>
      
      <Suspense fallback={<div>Loading notifications...</div>}>
        <NotificationList notifications={notifications()} />
      </Suspense>
    </div>
  )
}
```

## 错误处理

### ErrorBoundary 集成

```typescript
import { Suspense, ErrorBoundary } from 'essor'

function App() {
  return (
    <ErrorBoundary fallback={(error) => <ErrorView error={error} />}>
      <Suspense fallback={<Loading />}>
        <AsyncContent />
      </Suspense>
    </ErrorBoundary>
  )
}
```

### 错误流式传输

当异步边界中发生错误时，会发送错误替换脚本：

```html
<template id="suspense-1-error">
  <div class="error">
    <h2>Error</h2>
    <p>Failed to load user data</p>
  </div>
</template>
<script>
  (function() {
    const template = document.getElementById('suspense-1-error')
    const target = document.querySelector('[data-suspense-id="suspense-1"]')
    target.replaceWith(template.content.cloneNode(true))
  })()
</script>
```

## 高级用法

### 手动刷新

```typescript
import { StreamingContext } from '@estjs/server'

const context = new StreamingContext(ssrContext)

// 注册边界
const boundaryId = context.registerBoundary(asyncPromise)

// 等待所有边界完成
await context.waitForAll()

// 获取待处理的边界
const pending = context.getPendingBoundaries()

// 获取已解析的边界
const resolved = context.getResolvedBoundaries()
```

### 自定义替换脚本

```typescript
import { generateErrorScript, generateReplacementScript } from '@estjs/server'

// 生成成功替换脚本
const script = generateReplacementScript('suspense-1', '<div>Content</div>')

// 生成错误替换脚本
const errorScript = generateErrorScript('suspense-1', '<div>Error</div>')
```

### SSR 上下文集成

```typescript
import { SSRContext, renderToStream } from '@estjs/server'

const ssrContext = new SSRContext()
ssrContext.set('theme', 'dark')

const stream = renderToStream(App, { ssrContext })
```

## 性能优化

### 1. 优先级控制

将重要内容放在 Suspense 外部，确保立即发送：

```typescript
function App() {
  return (
    <div>
      {/* 关键内容，立即渲染 */}
      <header>
        <h1>My App</h1>
        <nav>{/* ... */}</nav>
      </header>
      
      {/* 次要内容，延迟加载 */}
      <Suspense fallback={<Loading />}>
        <SecondaryContent />
      </Suspense>
    </div>
  )
}
```

### 2. 粒度控制

使用多个小的 Suspense 边界而不是一个大的：

```typescript
// ❌ 不好：一个大边界
<Suspense fallback={<Loading />}>
  <UserProfile />
  <PostList />
  <CommentList />
</Suspense>

// ✅ 好：多个小边界
<Suspense fallback={<UserLoading />}>
  <UserProfile />
</Suspense>
<Suspense fallback={<PostsLoading />}>
  <PostList />
</Suspense>
<Suspense fallback={<CommentsLoading />}>
  <CommentList />
</Suspense>
```

### 3. 预加载关键资源

```typescript
function App() {
  // 预加载关键资源
  const [user] = createResource(() => fetchUser(), {
    ssrLoad: true  // 在 SSR 时立即加载
  })
  
  // 延迟加载次要资源
  const [stats] = createResource(() => fetchStats(), {
    ssrLoad: false  // 只在客户端加载
  })
  
  return (
    <div>
      <Suspense fallback={<Loading />}>
        <UserProfile user={user()} />
      </Suspense>
      
      <Suspense fallback={<Loading />}>
        <Stats stats={stats()} />
      </Suspense>
    </div>
  )
}
```

## 最佳实践

### 1. 提供有意义的 Fallback

```typescript
// ❌ 不好
<Suspense fallback={<div>Loading...</div>}>
  <UserProfile />
</Suspense>

// ✅ 好
<Suspense fallback={
  <div class="skeleton">
    <div class="skeleton-avatar" />
    <div class="skeleton-text" />
  </div>
}>
  <UserProfile />
</Suspense>
```

### 2. 避免过度嵌套

```typescript
// ❌ 不好：过度嵌套
<Suspense fallback={<Loading />}>
  <Suspense fallback={<Loading />}>
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  </Suspense>
</Suspense>

// ✅ 好：扁平结构
<Suspense fallback={<Loading />}>
  <Content />
</Suspense>
```

### 3. 错误边界保护

始终使用 ErrorBoundary 包裹 Suspense：

```typescript
<ErrorBoundary fallback={(error) => <ErrorView error={error} />}>
  <Suspense fallback={<Loading />}>
    <AsyncContent />
  </Suspense>
</ErrorBoundary>
```

### 4. 测试流式渲染

```typescript
import { renderToStream } from '@estjs/server'
import { describe, expect, it } from 'vitest'

describe('Streaming SSR', () => {
  it('should stream content progressively', async () => {
    const stream = renderToStream(App, {})
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    
    let html = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
    }
    
    expect(html).toContain('<header>')
    expect(html).toContain('data-suspense-id')
  })
})
```

## 浏览器兼容性

流式渲染需要浏览器支持：

- ReadableStream API
- Template 元素
- 现代 JavaScript

支持的浏览器：
- Chrome 52+
- Firefox 65+
- Safari 10.1+
- Edge 79+

## 服务器配置

### Node.js

```typescript
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { renderToStream } from '@estjs/server'

createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/html',
    'Transfer-Encoding': 'chunked'
  })
  
  const stream = renderToStream(App, {})
  const nodeStream = Readable.fromWeb(stream)
  
  nodeStream.pipe(res)
}).listen(3000)
```

### Deno

```typescript
import { renderToStream } from '@estjs/server'

Deno.serve((req) => {
  const stream = renderToStream(App, {})
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/html',
      'Transfer-Encoding': 'chunked'
    }
  })
})
```

### Cloudflare Workers

```typescript
import { renderToStream } from '@estjs/server'

export default {
  async fetch(request) {
    const stream = renderToStream(App, {})
    
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/html'
      }
    })
  }
}
```

## 注意事项

1. **SEO**：搜索引擎爬虫可能不等待流式内容完成
2. **缓存**：流式响应通常不应该被缓存
3. **错误处理**：流开始后无法更改 HTTP 状态码
4. **超时**：设置合理的超时时间避免流挂起
5. **内存**：大量并发流可能消耗大量内存

## 相关 API

- [Suspense](../components/Suspense.md) - Suspense 组件
- [createResource](./resources.md) - 同构资源
