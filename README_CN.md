# Essor - 下一代前端框架

<div align="center">

![Essor Logo](logo.svg)

**就是 JavaScript & JSX — 细粒度响应式，无虚拟 DOM，极致性能**

[![npm version](https://img.shields.io/npm/v/essor.svg)](https://www.npmjs.com/package/essor)
[![npm downloads](https://img.shields.io/npm/dm/essor.svg)](https://www.npmjs.com/package/essor)
[![GitHub license](https://img.shields.io/github/license/estjs/essor.svg)](https://github.com/estjs/essor/blob/main/LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/estjs/essor.svg)](https://github.com/estjs/essor/issues)
![codecov](https://img.shields.io/codecov/c/github/estjs/essor)
![ci](https://img.shields.io/github/actions/workflow/status/estjs/essor/ci.yml?label=CI&logo=GitHub)

[English](./README.md) | 简体中文

</div>

## ✨ 特性

- 🚀 **细粒度响应式** — 基于 Signal 的响应式系统，无虚拟 DOM，精准 DOM 更新
- ✨ **`$` 前缀魔法** — 声明 `const $count = 0`，Babel 插件自动将其转换为 signal
- 🎯 **零配置** — `npm create essor@latest` 开箱即用
- 🔧 **TypeScript** — 完全支持 TypeScript 严格模式
- 🎨 **JSX 支持** — 熟悉的 JSX 语法，支持 `bind:value` 双向绑定
- 📦 **模块化** — 支持 Tree-shaking，极小的包体积
- 🌐 **SSR/SSG** — 支持服务端渲染和静态站点生成
- 🔄 **HMR** — 组件级热模块替换
- 🛠️ **通用构建** — 支持 Vite、Webpack、Rollup、Rspack、esbuild

## 🚀 快速开始

### 1. 创建项目

```bash
npm create essor@latest my-app
cd my-app && npm install
```

### 2. 编写组件

`$` 前缀是核心概念 — 带 `$` 前缀的变量会被 Babel 插件自动转换为响应式 signal：

```jsx
import { createApp } from 'essor';

function Counter() {
  // $count 自动变为 signal(0)
  const $count = 0;

  return (
    <div>
      <h1>Count: {$count}</h1>
      <button onClick={() => $count++}>+1</button>
    </div>
  );
}

createApp(Counter, '#app');
```

### 3. 双向绑定

```jsx
function Form() {
  const $name = '';

  return (
    <div>
      <input bind:value={$name} placeholder="输入名字" />
      <p>你好，{$name}！</p>
    </div>
  );
}
```

### 4. 启动开发服务器

```bash
npm run dev
```

## 📦 包结构

| 包名 | 描述 |
|------|------|
| `essor` | 主入口 — 自动解析浏览器/Node 导出 |
| `@estjs/signals` | 响应式原语：signal、computed、effect、reactive、watch |
| `@estjs/template` | 渲染、水合、生命周期、Suspense、Portal |
| `@estjs/server` | SSR/SSG：`renderToString`、`createSSGComponent` |
| `babel-plugin-essor` | JSX 转换 + `$` 前缀自动 signal 转换 |
| `unplugin-essor` | 构建集成 + HMR 运行时 |

## 📚 文档

- [文档](https://essor.netlify.app/)
- [API 参考](https://essor.netlify.app/api)
- [在线演示](https://essor-playground.netlify.app/)
- [示例](./examples)

## 🎯 示例

查看 [examples](./examples) 目录：

- [Signals](./examples/signals) — Signal 状态、computed 输出与批量更新
- [TodoMVC](./examples/todo-mvc) — 基础待办流程：新增、编辑、筛选、切换与清理
- [Fragment](./examples/fragment) — 无包裹节点的表格行组合
- [Binding](./examples/binding) — text、select、range、files 等绑定能力
- [Provide](./examples/provide) — 带嵌套覆盖的依赖注入作用域
- [Portal](./examples/portal) — 传送目标切换与行内回退
- [Suspense](./examples/suspense) — 聚焦异步边界与 loading fallback
- [HMR](./examples/hmr) — 有状态热更新演示
- [Hydrate](./examples/hydrate) — SSR 壳体与客户端水合流程

## 🤝 贡献

我们欢迎任何形式的贡献！

- 🐛 [报告 Bug](https://github.com/estjs/essor/issues)
- 💡 [建议功能](https://github.com/estjs/essor/discussions)
- 📝 [提交 PR](https://github.com/estjs/essor/pulls)
- 📚 [改进文档](https://github.com/estjs/essor/tree/main/docs)

### 开发环境设置

```bash
git clone https://github.com/estjs/essor.git
cd essor

pnpm install
pnpm dev       # 监听模式
pnpm test      # 单元测试
pnpm test:e2e  # E2E 测试
pnpm build     # 构建所有包
```

## 📄 许可证

[MIT License](./LICENSE)

---

<div align="center">

**如果这个项目对你有帮助，请给我们一个 ⭐️**

[GitHub](https://github.com/estjs/essor) | [文档](https://essor.netlify.app/) | [讨论](https://github.com/estjs/essor/discussions)

</div>
