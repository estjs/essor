# Essor - 下一代前端框架

<div align="center">

![Essor Logo](logo.svg)

**🚀 就是 JavaScript - 快速上手，极致性能，无需学习复杂概念**

[![npm version](https://img.shields.io/npm/v/essor.svg)](https://www.npmjs.com/package/essor)
[![npm downloads](https://img.shields.io/npm/dm/essor.svg)](https://www.npmjs.com/package/essor)
[![GitHub license](https://img.shields.io/github/license/estjs/essor.svg)](https://github.com/estjs/essor/blob/main/LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/estjs/essor.svg)](https://github.com/estjs/essor/issues)
![codecov](https://img.shields.io/codecov/c/github/estjs/essor)
![ci](https://img.shields.io/github/actions/workflow/status/estjs/essor/ci.yml?label=CI&logo=GitHub)

[English](./README.md) | 简体中文

</div>

## ✨ 特性

- 🚀 **极致性能** - 基于 Signal 的响应式系统，无虚拟 DOM
- 🎯 **零配置** - 开箱即用，无需复杂配置
- 🔧 **TypeScript** - 完全支持 TypeScript
- 🎨 **JSX 支持** - 熟悉的 JSX 语法，易于上手
- 📦 **模块化** - 支持 Tree-shaking，极小的包体积
- 🌐 **SSR/SSG** - 支持服务端渲染和静态站点生成
- 🔄 **HMR** - 热模块替换，卓越的开发体验
- 🛠️ **工具链** - 完整的构建工具链支持


## 🚀 快速开始

### 1. 创建项目

```bash
# 使用 create-essor
npm create essor@latest my-app

# 或者手动安装
npm install essor
```

### 2. 编写组件

```jsx
import { signal } from 'essor';

function Counter() {
  const count = signal(0);

  return (
    <div>
      <h1>Count: {count}</h1>
      <button onClick={() => count.value++}>
        Increment
      </button>
    </div>
  );
}
```

### 3. 启动开发服务器

```bash
npm run dev
```

## 📚 文档

- [文档](https://https://essor.netlify.app/)
- [API 参考](https://https://essor.netlify.app/api)
- [示例](./examples)
- [在线演示](https://https://essor-playground.netlify.app/)

## 🎯 示例

查看 [examples](./examples) 目录获取更多示例：

- [基础示例](./examples/basic) - 入门指南
- [Todo 应用](./examples/todo) - 完整应用
- [SSR 示例](./examples/ssr) - 服务端渲染
- [SSG 示例](./examples/ssg) - 静态站点生成
- [Suspense 示例](./examples/suspense) - 异步组件
- [Portal 示例](./examples/portal) - Portal 组件


## 🤝 贡献

我们欢迎任何形式的贡献！

- 🐛 [报告 Bug](https://github.com/estjs/essor/issues)
- 💡 [建议功能](https://github.com/estjs/essor/discussions)
- 📝 [提交 PR](https://github.com/estjs/essor/pulls)
- 📚 [改进文档](https://github.com/estjs/essor/tree/main/docs)

### 开发环境设置

```bash
# 克隆仓库
git clone https://github.com/estjs/essor.git
cd essor

# 安装依赖
pnpm install

# 启动开发模式
pnpm dev

# 运行测试
pnpm test

# 构建项目
pnpm build
```

## 📄 许可证

[MIT License](./LICENSE)

## 🙏 致谢

感谢所有为 Essor 做出贡献的开发者！

---

<div align="center">

**如果这个项目对你有帮助，请给我们一个 ⭐️**

[GitHub](https://github.com/estjs/essor) | [文档](https://essor.netlify.app/) | [讨论](https://github.com/estjs/essor/discussions)

</div>
