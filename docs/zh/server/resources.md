# 同构数据资源 (Isomorphic Resources)

## 概述

同构数据资源系统允许你编写一次数据加载逻辑，就能在服务端（SSR）和客户端（hydration/navigation）无缝运行。框架会自动处理数据的序列化、传输和复用，避免重复获取。

## createResource

创建一个同构数据资源，自动处理服务端数据获取、序列化和客户端 hydration。

### 类型签名

```typescript
function createResource<T>(
  fetcher: () => Promise<T>,
  options?: ResourceOptions<T>
): [Resource<T>, ResourceActions<T>]

interface ResourceOptions<T> {
  /** 初始值 */
  initialValue?: T
  /** 资源名称（用于调试和序列化） */
  name?: string
  /** 是否启用单次飞行去重（默认 true） */
  singleFlight?: boolean
  /** SSR 时是否预取（默认 true） */
  ssrLoad?: boolean
}

interface Resource<T> {
  (): T | undefined
  loading: Signal<boolean>
  error: Signal<Error | null>
  state: Signal<ResourceState>
  readonly id: string
}

interface ResourceActions<T> {
  mutate: (value: T) => void
  refetch: () => Promise<void>
}

type ResourceState = 'pending' | 'ready' | 'errored'
```

### 基础用法

```typescript
import { createResource } from 'essor'

function UserProfile({ userId }) {
  const [user, { refetch, mutate }] = createResource(async () => {
    const res = await fetch(`/api/users/${userId}`)
    return res.json()
  })
  
  return (
    <div>
      {user.loading.value && <div>加载中...</div>}
      {user.error.value && <div>错误: {user.error.value.message}</div>}
      {user() && (
        <div>
          <h1>{user()!.name}</h1>
          <p>{user()!.email}</p>
          <button onClick={refetch}>刷新</button>
        </div>
      )}
    </div>
  )
}
```

### 配合 Suspense 使用

```typescript
import { createResource, Suspense } from 'essor'

function UserProfile({ userId }) {
  const [user] = createResource(() => 
    fetch(`/api/users/${userId}`).then(r => r.json())
  )
  
  return (
    <Suspense fallback={<div>加载中...</div>}>
      <div>
        <h1>{user()!.name}</h1>
        <p>{user()!.email}</p>
      </div>
    </Suspense>
  )
}
```

### 使用选项

```typescript
const [user, { refetch }] = createResource(
  () => fetch('/api/user').then(r => r.json()),
  {
    name: 'user-profile',  // 用于调试和 SSR 上下文
    singleFlight: true,    // 启用请求去重
    ssrLoad: true,         // 在 SSR 时预取
    initialValue: null     // 初始值
  }
)
```

## 工作原理

### 服务端渲染 (SSR)

1. 在服务端执行时，`createResource` 会调用 fetcher 函数获取数据
2. 获取的数据会被序列化到 SSR 上下文中
3. SSR 上下文会被嵌入到 HTML 中的 `<script>` 标签

### 客户端 Hydration

1. 客户端加载时，从 HTML 中恢复 SSR 上下文
2. `createResource` 检测到 SSR 上下文中有数据
3. 直接使用缓存的数据，不重新获取
4. 避免了重复的网络请求

### 客户端导航

1. Hydration 后，SSR 上下文被清除
2. 后续的 `createResource` 调用会正常获取数据
3. 单次飞行机制确保相同请求只执行一次

## Resource 对象

### 访问器函数

```typescript
const [user] = createResource(fetcher)

// 调用资源函数获取当前值
const userData = user()  // T | undefined
```

### 状态信号

```typescript
// loading: 是否正在加载
user.loading.value  // boolean

// error: 错误对象（如果有）
user.error.value  // Error | null

// state: 当前状态
user.state.value  // 'pending' | 'ready' | 'errored'

// id: 资源唯一标识符
user.id  // string
```

## ResourceActions

### mutate

手动更新资源值，不触发重新获取。

```typescript
const [user, { mutate }] = createResource(fetcher)

// 更新用户数据
mutate({ ...user(), name: 'New Name' })
```

### refetch

手动触发重新获取数据。

```typescript
const [user, { refetch }] = createResource(fetcher)

// 刷新数据
await refetch()
```

## 高级特性

### 单次飞行去重

当多个组件使用相同的资源时，框架会自动去重请求：

```typescript
// 组件 A
const [user] = createResource(() => fetch('/api/user').then(r => r.json()))

// 组件 B（相同的资源）
const [user] = createResource(() => fetch('/api/user').then(r => r.json()))

// 只会发送一次请求，两个组件共享结果
```

### 错误处理

资源会自动捕获和序列化错误：

```typescript
const [data, { refetch }] = createResource(async () => {
  const res = await fetch('/api/data')
  if (!res.ok) {
    throw new Error('Failed to fetch')
  }
  return res.json()
})

// 错误会被保存到 error 信号
if (data.error.value) {
  console.error(data.error.value.message)
}
```

### 条件获取

```typescript
function UserProfile({ userId }) {
  const [user] = createResource(
    () => fetch(`/api/users/${userId}`).then(r => r.json()),
    {
      // 只在客户端获取，服务端跳过
      ssrLoad: false
    }
  )
  
  return <div>{user()?.name}</div>
}
```

## 最佳实践

### 1. 使用命名资源

为资源提供名称有助于调试和追踪：

```typescript
const [user] = createResource(fetcher, {
  name: 'user-profile'
})
```

### 2. 配合 Suspense 使用

使用 Suspense 可以提供更好的加载体验：

```typescript
<Suspense fallback={<Loading />}>
  <UserProfile />
</Suspense>
```

### 3. 错误边界

使用 ErrorBoundary 捕获资源错误：

```typescript
<ErrorBoundary fallback={(error) => <ErrorView error={error} />}>
  <UserProfile />
</ErrorBoundary>
```

### 4. 避免在循环中创建资源

资源应该在组件顶层创建，不要在循环或条件语句中创建：

```typescript
// ❌ 错误
function List({ ids }) {
  return ids.map(id => {
    const [item] = createResource(() => fetch(`/api/items/${id}`))
    return <div>{item()?.name}</div>
  })
}

// ✅ 正确
function Item({ id }) {
  const [item] = createResource(() => fetch(`/api/items/${id}`))
  return <div>{item()?.name}</div>
}

function List({ ids }) {
  return ids.map(id => <Item key={id} id={id} />)
}
```

## 类型推导

TypeScript 会自动推导资源的类型：

```typescript
interface User {
  id: number
  name: string
  email: string
}

// 类型自动推导为 Resource<User>
const [user] = createResource(async (): Promise<User> => {
  const res = await fetch('/api/user')
  return res.json()
})

// user() 的类型是 User | undefined
const userName = user()?.name
```

## 注意事项

1. **Fetcher 必须是纯函数**：fetcher 函数应该是纯函数，不依赖外部状态
2. **避免副作用**：不要在 fetcher 中执行副作用操作
3. **序列化限制**：只有可序列化的数据类型才能在 SSR 中传递
4. **资源 ID 唯一性**：相同的 fetcher 函数会被视为相同的资源

## 相关 API

- [Suspense](../components/Suspense.md) - 处理异步加载状态
