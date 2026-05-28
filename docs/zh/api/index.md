# API 参考

## 核心 API

- [`signal`](./signal.md) - 创建一个响应式信号
- [`computed`](./computed.md) - 创建一个计算属性
- [`effect`](./effect.md) - 创建一个自动跟踪依赖的副作用
- [`watch`](./watch.md) - 监听响应式数据的变化

## 响应式对象

- [`reactive`](./reactive.md) - 创建一个深度响应式对象
- [`shallowReactive`](./reactive.md#shallowreactive) - 创建一个浅层响应式对象
- [`isReactive`](./reactive.md#isreactive) - 检查一个对象是否是响应式的
- [`toRaw`](./reactive.md#toraw) - 获取响应式对象的原始对象

## 工具函数

- [`batch`](./batch-updates.md) - 批量处理更新
- [`untrack`](./effect.md#untrack) - 在不追踪依赖的情况下执行函数
- [`nextTick`](./batch-updates.md) - 在下一个微任务执行回调

## 运行时组件

- [`createApp`](./runtime-api.md) - 挂载应用到 DOM
- [`hydrate`](./runtime-api.md#hydrate) - 客户端激活
- [`definePlugin`](./runtime-api.md#defineplugin) - 定义插件
- [`template`](./runtime-api.md#template) - DOM 模板工厂
- [`For`](./runtime-api.md#for) - 列表渲染
- [`Fragment`](../components/Fragment.md) - 无包裹节点
- [`Portal`](../components/Portal.md) - 传送门渲染
- [`Suspense`](../components/Suspense.md) - 异步加载

## 生命周期与依赖注入

- [`onMount`](./lifecycle.md#onmount) - 组件挂载钩子
- [`onUpdate`](./lifecycle.md#onupdate) - 组件更新钩子
- [`onDestroy`](./lifecycle.md#ondestroy) - 组件销毁钩子
- [`provide`](./provide-inject.md#provide) / [`inject`](./provide-inject.md#inject) - 依赖注入

## 状态管理

- [`createStore`](./store.md) - 创建一个响应式状态管理器
- [`StoreActions`](./store.md#storeactions) - 状态管理器内置操作接口
