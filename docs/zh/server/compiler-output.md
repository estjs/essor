# 编译产物 API(`ssr*` 辅助函数)

::: warning 内部 API
本页列出的函数是**编译器目标**:它们由 `babel-plugin-essor` 在服务端模式下生成的代码调用,不面向手写代码。其签名与语义可能随任意编译器版本变化,不遵循 semver-major 约定,请勿将其视为稳定的公开接口。
:::

## 为什么会导出它们

Babel 插件将 JSX 编译为普通 JavaScript,这些代码在运行时必须从 `@estjs/server` `import` 这些辅助函数,因此它们必须出现在包的导出面上——可被 import 并不代表它们是公开 API。

其中许多辅助函数依赖与编译器之间的信任契约:例如 `render()` 会**原样拼接**字符串槽位,前提是每个槽位已由编译期选定的辅助函数完成转义。手动调用它们并传入用户输入会绕过该契约,可能重新引入 XSS。

## 速查表

| 导出 | 一句话用途 |
| --- | --- |
| `ssr` | 编译器专用模板辅助函数;拼接语义与 `render` 相同,但返回受信任的 SSR 节点,使嵌套 JSX 免于二次转义。 |
| `render` | 将静态模板片段与已预序列化的槽位字符串交替拼接(原样拼接、此处不转义),并注入 hydration key。 |
| `ssrComponent` | `createSSRComponent` 的普通别名,为编译产物稳定性保留。 |
| `ssrAttr` | 将单个属性渲染为已转义的属性片段(如 ` name="v"`);不安全的属性名会被整体丢弃。 |
| `ssrAttrDynamic` | 渲染动态属性字符串,自动解包响应式值,并对 `class`/`style`/布尔/事件属性做特殊处理。 |
| `ssrClass` | 将 `class` 属性(字符串、对象或数组值)渲染为已转义的属性片段。 |
| `ssrStyle` | 将 `style` 属性(字符串或对象值)渲染为已转义的属性片段。 |
| `ssrBind` | 将 `bind:*` 双向绑定的初始值渲染为 HTML 属性字符串,使 hydration 前的标记与客户端一致。 |
| `ssrSelected` | 为绑定 `<select>` 内的 `<option>` 渲染 `selected` 属性。 |
| `ssrTextValue` | 为 `<textarea bind:value>` 渲染已转义的初始文本。 |
| `ssrSpread` | 将 props 展开渲染为已转义的属性片段,跳过事件处理器和特殊键。 |
| `normalizeProps` | 规范化组件 props,将 `class`/`style` 转换为规范化格式。 |
| `escape` | 序列化 `{expr}` 子槽位,对裸字符串转义;结果带有信任标记,不会被二次转义。 |
| `resolve` | 在组件边界序列化组件返回值:递归处理数组/thunk,对裸字符串转义,返回普通字符串。 |
| `escapeHTML` | 将字符串中的 HTML 特殊字符转义为实体引用(从 `@estjs/shared` 重导出)。 |
| `injectHydrationKeys` | 向已渲染的 HTML 内容添加 hydration 属性(`data-hk` 等)。 |
| `getHydrationKey` | 从每请求计数器返回下一个 hydration key(从 `@estjs/template` 重导出)。 |
| `resetHydrationKey` | 重置 hydration key 计数器(从 `@estjs/template` 重导出)。 |
| `TELEPORT_CALLSITE_ANCHOR` / `TELEPORT_BLOCK_START` / `TELEPORT_BLOCK_END` | SSR `Portal` 使用的注释标记常量,用于标记 teleport 调用位置和被传送的内容块。 |

## 手写代码应该用什么

手写 SSR 代码请使用公开 API:

- `renderToString` / `renderToStringAsync` 与 `createSSRComponent` —— 参见[服务端渲染](/zh/server/ssr)
- `unsafeHTML` 用于显式信任的原始 HTML —— 参见[安全与转义](/zh/server/security)
- `createSSRContext` / `getSSRContext` —— 参见 [SSR 上下文](/zh/server/ssr-context)
