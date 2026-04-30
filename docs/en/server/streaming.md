# Streaming SSR

## Overview

Streaming rendering allows you to progressively send HTML to the client instead of waiting for the entire page to render. Combined with Suspense boundaries, it enables out-of-order streaming, letting users see content as soon as possible.

## renderToStream

Render a component as a readable stream, supporting out-of-order streaming.

### Type Signature

```typescript
function renderToStream<P>(
  component: ComponentFn<P>,
  props: P
): ReadableStream<Uint8Array>
```

### Basic Usage

```typescript
import { Readable } from 'node:stream'
import { renderToStream } from '@estjs/server'
import App from './App'

// Node.js

const stream = renderToStream(App, { userId: '123' })
const nodeStream = Readable.fromWeb(stream)

nodeStream.pipe(res)

// Or use the Web Streams API
const response = new Response(stream, {
  headers: {
    'Content-Type': 'text/html',
    'Transfer-Encoding': 'chunked'
  }
})
```

### Example

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
        
        {/* Synchronous content, sent immediately */}
        <nav>
          <a href="/">Home</a>
          <a href="/about">About</a>
        </nav>
        
        {/* Async content, shows fallback first */}
        <Suspense fallback={<div>Loading user...</div>}>
          <UserProfile userId="123" />
        </Suspense>
        
        {/* Another async boundary, resolves independently */}
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

### Rendered Output

**Initial HTML (sent immediately)**:
```html
<html>
  <head><title>My App</title></head>
  <body>
    <header><h1>My App</h1></header>
    <nav>
      <a href="/">Home</a>
      <a href="/about">About</a>
    </nav>
    
    <!-- Suspense boundary 1 -->
    <div data-suspense-id="suspense-1">
      <div>Loading user...</div>
    </div>
    
    <!-- Suspense boundary 2 -->
    <div data-suspense-id="suspense-2">
      <div>Loading posts...</div>
    </div>
    
    <footer><p>© 2024 My App</p></footer>
  </body>
</html>
```

**User data ready (sent out-of-order)**:
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

**Post list ready (sent out-of-order)**:
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

## Suspense Integration

### Basic Suspense

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

### Nested Suspense

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

### Multiple Async Resources

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

## Error Handling

### ErrorBoundary Integration

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

### Error Streaming

When an error occurs in an async boundary, an error replacement script is sent:

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

## Advanced Usage

### Manual Refresh

```typescript
import { StreamingContext } from '@estjs/server'

const context = new StreamingContext(ssrContext)

// Register boundary
const boundaryId = context.registerBoundary(asyncPromise)

// Wait for all boundaries
await context.waitForAll()

// Get pending boundaries
const pending = context.getPendingBoundaries()

// Get resolved boundaries
const resolved = context.getResolvedBoundaries()
```

### Custom Replacement Scripts

```typescript
import { generateErrorScript, generateReplacementScript } from '@estjs/server'

// Generate success replacement script
const script = generateReplacementScript('suspense-1', '<div>Content</div>')

// Generate error replacement script
const errorScript = generateErrorScript('suspense-1', '<div>Error</div>')
```

### SSR Context Integration

```typescript
import { SSRContext, renderToStream } from '@estjs/server'

const ssrContext = new SSRContext()
ssrContext.set('theme', 'dark')

const stream = renderToStream(App, { ssrContext })
```

## Performance Optimization

### 1. Priority Control

Place important content outside Suspense to ensure it's sent immediately:

```typescript
function App() {
  return (
    <div>
      {/* Critical content, rendered immediately */}
      <header>
        <h1>My App</h1>
        <nav>{/* ... */}</nav>
      </header>
      
      {/* Secondary content, lazy loaded */}
      <Suspense fallback={<Loading />}>
        <SecondaryContent />
      </Suspense>
    </div>
  )
}
```

### 2. Granularity Control

Use multiple small Suspense boundaries instead of one large one:

```typescript
// ❌ Bad: one large boundary
<Suspense fallback={<Loading />}>
  <UserProfile />
  <PostList />
  <CommentList />
</Suspense>

// ✅ Good: multiple small boundaries
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

### 3. Preload Critical Resources

```typescript
function App() {
  // Preload critical resources
  const [user] = createResource(() => fetchUser(), {
    ssrLoad: true  // Load immediately during SSR
  })
  
  // Defer secondary resources
  const [stats] = createResource(() => fetchStats(), {
    ssrLoad: false  // Only load on client
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

## Best Practices

### 1. Provide Meaningful Fallbacks

```typescript
// ❌ Bad
<Suspense fallback={<div>Loading...</div>}>
  <UserProfile />
</Suspense>

// ✅ Good
<Suspense fallback={
  <div class="skeleton">
    <div class="skeleton-avatar" />
    <div class="skeleton-text" />
  </div>
}>
  <UserProfile />
</Suspense>
```

### 2. Avoid Excessive Nesting

```typescript
// ❌ Bad: excessive nesting
<Suspense fallback={<Loading />}>
  <Suspense fallback={<Loading />}>
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  </Suspense>
</Suspense>

// ✅ Good: flat structure
<Suspense fallback={<Loading />}>
  <Content />
</Suspense>
```

### 3. Error Boundary Protection

Always wrap Suspense with ErrorBoundary:

```typescript
<ErrorBoundary fallback={(error) => <ErrorView error={error} />}>
  <Suspense fallback={<Loading />}>
    <AsyncContent />
  </Suspense>
</ErrorBoundary>
```

### 4. Testing Streaming

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

## Browser Compatibility

Streaming rendering requires browser support for:

- ReadableStream API
- Template element
- Modern JavaScript

Supported browsers:
- Chrome 52+
- Firefox 65+
- Safari 10.1+
- Edge 79+

## Server Configuration

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

## Notes

1. **SEO**: Search engine crawlers may not wait for streaming content to complete
2. **Caching**: Streaming responses generally should not be cached
3. **Error handling**: HTTP status code cannot be changed after the stream starts
4. **Timeouts**: Set reasonable timeout values to prevent streams from hanging
5. **Memory**: A large number of concurrent streams may consume significant memory

## Related APIs

- [Suspense](../components/Suspense.md) - Suspense component
- [createResource](./resources.md) - Isomorphic resources
