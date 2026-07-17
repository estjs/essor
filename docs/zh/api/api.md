# API 总览

Essor 的 API 分为响应式核心、运行时组件和工具函数三大类别。

## 响应式核心 (@estjs/signals)

- [`signal`](./signal.md) — 创建响应式信号
- [`computed`](./computed.md) — 创建计算属性
- [`effect`](./effect.md) — 创建自动追踪依赖的副作用
- [`watch`](./watch.md) — 监听响应式数据变化
- [`reactive`](./reactive.md) — 创建深度响应式对象
- [`store`](./store.md) — 创建状态管理器

## 运行时组件 (@estjs/template)

- [`createApp`](./runtime-api.md#createapp) — 挂载应用到 DOM
- [`hydrate`](./runtime-api.md#hydrate) — 客户端激活 SSR 渲染的 HTML
- [`definePlugin`](./runtime-api.md#defineplugin) — 定义带类型化 options 的插件
- [`template`](./runtime-api.md#template) — 创建可复用的 DOM 模板工厂
- [`For`](./runtime-api.md#for) — 列表渲染组件
- [`Fragment`](./runtime-api.md#fragment) — 无包裹节点渲染多个子元素
- [`Portal`](./runtime-api.md#portal) — 将子元素渲染到指定 DOM 节点
- [`Suspense`](./runtime-api.md#suspense) — 异步加载状态管理
- [`createResource`](./runtime-api.md#createresource) — 创建异步数据资源

## 生命周期与依赖注入

- [`onMount`](./lifecycle.md#onmount) — 组件挂载钩子
- [`onUpdate`](./lifecycle.md#onupdate) — 组件更新钩子
- [`onDestroy`](./lifecycle.md#ondestroy) — 组件销毁钩子
- [`onScopeDispose`](./lifecycle.md#作用域清理) — 注册作用域清理函数
- [`provide`](./provide-inject.md#provide) / [`inject`](./provide-inject.md#inject) — 跨层级依赖注入

## 工具函数

- [`batch`](./batch.md) — 批量更新信号
- [`untrack`](./effect.md#untrack) — 不追踪依赖地读取值
- [`nextTick`](./batch.md#nexttick) — 下一个微任务执行回调

## SSR / SSG (@estjs/server)

- [`renderToString`](../server/ssr.md) — 将组件渲染为 HTML 字符串
- [`createSSRComponent`](../server/ssg.md) — 将组件子树渲染为品牌化 HTML 字符串
