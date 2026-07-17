# 资源 (Resources)

## 概述

`createResource` 会把异步 fetcher 转成响应式状态，并且能和 `Suspense` 配合。组件创建时会启动请求；资源暴露 loading、error、state 信号；资源重新获取或组件销毁时，会中止已经过期的请求。

## createResource

### 类型签名

```typescript
function createResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  options?: ResourceOptions<T>
): [Resource<T>, ResourceActions<T>]

interface ResourceOptions<T> {
  /** 首次请求完成前返回的初始值 */
  initialValue?: T
}

interface Resource<T> {
  (): T | undefined
  loading: Signal<boolean>
  error: Signal<Error | null>
  state: Signal<'pending' | 'ready' | 'errored'>
}

interface ResourceActions<T> {
  mutate: (value: T) => void
  refetch: () => Promise<void>
}
```

### 基础用法

```tsx
import { createResource } from 'essor'

function UserProfile({ userId }: { userId: string }) {
  const [user, { refetch, mutate }] = createResource(async (signal) => {
    const res = await fetch(`/api/users/${userId}`, { signal })
    if (!res.ok) throw new Error('Failed to load user')
    return res.json()
  })

  return (
    <div>
      {user.loading.value && <div>加载中...</div>}
      {user.error.value && <div>错误：{user.error.value.message}</div>}
      {user() && (
        <div>
          <h1>{user()!.name}</h1>
          <p>{user()!.email}</p>
          <button onClick={refetch}>刷新</button>
          <button onClick={() => mutate({ ...user()!, name: '本地草稿名' })}>
            本地重命名
          </button>
        </div>
      )}
    </div>
  )
}
```

`AbortSignal` 可以让 `fetch` 取消过期请求。忽略这个 signal 也安全，但把它传给 `fetch` 能避免快速 `refetch` 或组件卸载后继续浪费网络请求。

### 配合 Suspense 使用

资源会把每次 pending 请求注册到最近的 `Suspense` 边界。注册的请求 settle 前，fallback 会保持显示。

```tsx
import { createResource, Suspense } from 'essor'

function UserProfile({ userId }: { userId: string }) {
  const [user] = createResource(async (signal) => {
    const res = await fetch(`/api/users/${userId}`, { signal })
    if (!res.ok) throw new Error('Failed to load user')
    return res.json()
  })

  return (
    <div>
      <h1>{user()?.name}</h1>
      <p>{user()?.email}</p>
    </div>
  )
}

function Page() {
  return (
    <Suspense fallback={<div>加载中...</div>}>
      <UserProfile userId="123" />
    </Suspense>
  )
}
```

## Resource 对象

### 访问器函数

```typescript
const [user] = createResource(fetcher)

const userData = user() // T | undefined
```

### 状态信号

```typescript
user.loading.value // boolean
user.error.value   // Error | null
user.state.value   // 'pending' | 'ready' | 'errored'
```

## ResourceActions

### mutate

手动替换当前资源值，不会发起新请求。

```typescript
const [user, { mutate }] = createResource(fetcher)

mutate({ ...user()!, name: 'New Name' })
```

### refetch

中止当前进行中的请求，启动一次新请求，并在新请求结束后 resolve。

```typescript
const [user, { refetch }] = createResource(fetcher)

await refetch()
```

## 错误处理

fetcher 抛出的错误会保存到 `resource.error`，并把 `resource.state.value` 设为 `'errored'`。

```typescript
const [data] = createResource(async (signal) => {
  const res = await fetch('/api/data', { signal })
  if (!res.ok) throw new Error('Failed to fetch data')
  return res.json()
})

if (data.error.value) {
  console.error(data.error.value.message)
}
```

## 最佳实践

1. 把框架传入的 `AbortSignal` 继续传给 `fetch` 或其他可取消 API。
2. 在组件顶层创建 resource，不要在循环里创建。
3. 页面级加载状态用 `Suspense`，局部控件可直接读取 `loading/error/state`。
4. 在 `state.value === 'ready'` 或传入 `initialValue` 之前，把 `resource()` 当作可能为 `undefined` 处理。

## 相关 API

- [Suspense](../components/Suspense.md) - 处理异步加载状态
