# 安全与转义 (SSR)

Essor 的服务端渲染器**默认转义**不可信输出。本页记录转义契约、`unsafeHTML()` 逃生口，以及信任如何穿越组件边界。

## 转义契约

SSR 期间，**普通字符串永远不被信任**。任何到达输出的裸字符串——无论是手写组件的返回值、`{expr}` 子表达式、`Suspense`/`For` 的 fallback，还是经 `props.children` 转发的内容——都会被 HTML 转义：

```typescript
import { renderToString } from '@estjs/server';

// 手写组件以普通字符串返回原始标记:
const Widget = () => '<b>hi</b>';

renderToString(Widget);
// 输出: &lt;b&gt;hi&lt;/b&gt;   ← 被转义,不会被解析为 HTML
```

这是刻意的 XSS 加固：即使用户输入最终进入了渲染字符串，也无法注入标记。

```typescript
const userInput = '<img src=x onerror=alert(1)>';
const Comment = () => userInput;

renderToString(Comment);
// 输出: &lt;img src=x onerror=alert(1)&gt;   ← 攻击被消解
```

## 编译后的 JSX 为什么保持原样

你可能会问：如果所有字符串都被转义，编译后的 JSX 怎么产出真正的 HTML？

信任由**不可伪造的值品牌**承载，而不是由值的位置或来源决定。编译器为可信的嵌套 JSX 与组件输出发出品牌化的 *SSR 节点*对象。只有品牌化的值会以原始 HTML 通过；其余一切都被转义。产生品牌值的途径只有三种：

1. 编译产物 `ssr()` / `ssrComponent()` 的输出（Babel 插件从你的 JSX 生成）
2. `escape()` 的结果（已转义内容，可安全地再次进入管线而不被二次转义）
3. 显式的 `unsafeHTML()` 调用（见下文）

品牌基于对象在 `WeakSet` 中的成员身份，普通字符串永远无法冒充可信值。

## unsafeHTML

`unsafeHTML()` 显式地将一个字符串标记为可信的原始 HTML：

```typescript
import { renderToString, unsafeHTML } from '@estjs/server';

const Widget = () => unsafeHTML('<b>hi</b>');

renderToString(Widget);
// 输出: <b>hi</b>
```

这个名字刻意让人警觉：**调用者为该字符串的安全性背书**。将未经消毒的用户输入传入 `unsafeHTML()` 会重新引入 XSS：

```typescript
// ❌ 永远不要对用户可控数据这样做
const Comment = ({ text }) => unsafeHTML(text);

// ✅ 先消毒(如在 jsdom 上用 DOMPurify),或者
//    更好:让 JSX 把文本作为子节点渲染,自动转义
const Comment = ({ text }) => <p>{text}</p>;
```

`unsafeHTML()` 只应用于你自己生成或审核过的标记——例如带严格 sanitizer 的 Markdown 渲染器输出，或静态 HTML 片段。

## createSSRComponent 返回品牌节点

`createSSRComponent(Component, props)` 渲染组件子树并返回**品牌化 SSR 节点**——已经安全的 HTML，可以继续穿越组件边界而不被二次转义。用 `String()` 转换为最终 HTML：

```typescript
import { createSSRComponent } from '@estjs/server';

const html = String(createSSRComponent(Header, {}));
```

## 迁移说明 (0.0.18)

0.0.18 之前，手写组件可以返回原始 HTML 字符串并按原样输出。从 0.0.18 起这些字符串默认被转义。如果你依赖旧行为，请将可信标记包裹在 `unsafeHTML()` 中。详见[迁移指南](/zh/guide/migration)。

## 速查表

| 值 | SSR 输出 |
|----|---------|
| 普通字符串(组件返回值、子表达式、fallback) | **转义** |
| 编译后 JSX(`ssr()` / `ssrComponent()` 输出) | 原样(品牌化) |
| `escape(value)` 结果 | 原样(已转义一次,品牌化) |
| `unsafeHTML(html)` | 原样 —— 调用者为安全性背书 |
| `createSSRComponent(...)` 结果 | 原样(品牌化) |
