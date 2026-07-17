# 迁移指南

本页记录 Essor 各版本间的破坏性变更及升级方式。

## 0.0.18

### SSR:裸字符串现在默认转义(破坏性)

**之前**:手写组件返回原始 HTML 字符串时，SSR 期间按原样输出。

**之后**:所有裸字符串都会被 HTML 转义。只有品牌化的值——编译后的 JSX 输出、`escape()` 结果、显式的 `unsafeHTML()`——才按原样通过。

```typescript
// 之前 (≤0.0.17): 输出为 <b>hi</b>
const Widget = () => '<b>hi</b>';

// 之后 (0.0.18+): 输出为 &lt;b&gt;hi&lt;/b&gt;
// 修复 —— 显式为标记背书:
import { unsafeHTML } from '@estjs/server';
const Widget = () => unsafeHTML('<b>hi</b>');
```

**影响范围**:仅限返回原始 HTML *字符串*的手写组件。基于 JSX 的组件不受影响——编译产物会自动品牌化。

**原因**:XSS 加固。任何流入渲染字符串的用户输入都不再能注入标记。完整契约见[安全与转义](/zh/server/security)。

### createSSRComponent 返回品牌化 SSR 节点

`createSSRComponent`（及其编译别名 `ssrComponent`）现在返回品牌化 SSR 节点而非普通字符串。模板字符串插值和 `String()` 转换的行为与之前完全一致，大多数代码无需修改。对结果做严格 `typeof x === 'string'` 检查的代码应先 `String(x)`。

### renderToString 遇到异步组件直接抛错

向 `renderToString` 传入 `async` 组件现在会立即抛错，而不是把 `[object Promise]` 静默序列化进 HTML。请使用 `renderToStringAsync`——见[异步 SSR](/zh/server/streaming)。

## 更早版本

早期版本没有记录迁移说明。完整历史见[更新日志](https://github.com/estjs/essor/blob/main/CHANGELOG.md)。
