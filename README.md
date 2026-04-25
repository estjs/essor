# Essor - Next Generation Frontend Framework

<div align="center">

![Essor Logo](logo.svg)

**It's just JavaScript & JSX — fine-grained reactivity, no virtual DOM, ultimate performance**

[![npm version](https://img.shields.io/npm/v/essor.svg)](https://www.npmjs.com/package/essor)
[![npm downloads](https://img.shields.io/npm/dm/essor.svg)](https://www.npmjs.com/package/essor)
[![GitHub license](https://img.shields.io/github/license/estjs/essor.svg)](https://github.com/estjs/essor/blob/main/LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/estjs/essor.svg)](https://github.com/estjs/essor/issues)
![codecov](https://img.shields.io/codecov/c/github/estjs/essor)
![ci](https://img.shields.io/github/actions/workflow/status/estjs/essor/ci.yml?label=CI&logo=GitHub)

English | [简体中文](./README_CN.md)

</div>

## ✨ Features

- 🚀 **Fine-grained Reactivity** — Signal-based system, no virtual DOM, surgical DOM updates
- ✨ **`$` Prefix Magic** — Declare `const $count = 0` and it auto-becomes a signal via Babel transform
- 🎯 **Zero Config** — Works out of the box with `npm create essor@latest`
- 🔧 **TypeScript** — Full TypeScript support with strict mode
- 🎨 **JSX Support** — Familiar JSX syntax with two-way binding via `bind:value`
- 📦 **Modular** — Tree-shakable packages, tiny bundle size
- 🌐 **SSR/SSG** — Server-side rendering and static site generation
- 🔄 **HMR** — Hot module replacement with component-level granularity
- 🛠️ **Universal Build** — Vite, Webpack, Rollup, Rspack, esbuild support

## 🚀 Quick Start

### 1. Create Project

```bash
npm create essor@latest my-app
cd my-app && npm install
```

### 2. Write a Component

The `$` prefix is the key concept — variables prefixed with `$` are automatically transformed into reactive signals by the Babel plugin:

```jsx
import { createApp } from 'essor';

function Counter() {
  // $count becomes signal(0) automatically
  const $count = 0;

  return (
    <div>
      <h1>Count: {$count}</h1>
      <button onClick={() => $count++}>Increment</button>
    </div>
  );
}

createApp(Counter, '#app');
```

### 3. Two-way Binding

```jsx
function Form() {
  let $name = '';

  return (
    <div>
      <input bind:value={$name} placeholder="Enter name" />
      <p>Hello, {$name}!</p>
    </div>
  );
}
```

### 4. Start Development Server

```bash
npm run dev
```

## 📦 Packages

| Package | Description |
|---------|-------------|
| `essor` | Main entry — auto-resolves browser/node exports |
| `@estjs/signals` | Reactive primitives: signal, computed, effect, reactive, watch |
| `@estjs/template` | Rendering, hydration, lifecycle, Suspense, Portal |
| `@estjs/server` | SSR/SSG: `renderToString`, `createSSGComponent` |
| `babel-plugin-essor` | JSX transform + `$` prefix auto-signal conversion |
| `unplugin-essor` | Build integration + HMR runtime |

## 📚 Documentation

- [Documentation](https://essor.netlify.app/)
- [API Reference](https://essor.netlify.app/api)
- [Online Playground](https://essor-playground.netlify.app/)
- [Examples](./examples)

## 🎯 Examples

Check out the [examples](./examples) directory:

- [Basic](./examples/basic) — Getting started with signals
- [Todo App](./examples/todo) — Complete CRUD application
- [Fragment](./examples/fragment) — Fragment components
- [Portal](./examples/portal) — Portal components
- [Provide/Inject](./examples/provide) — Dependency injection
- [Suspense](./examples/suspense) — Async components with loading states
- [HMR](./examples/hmr) — Hot module replacement demo
- [SSR](./examples/ssr) — Server-side rendering
- [SSG](./examples/ssg) — Static site generation

## 🤝 Contributing

We welcome all forms of contributions!

- 🐛 [Report Bugs](https://github.com/estjs/essor/issues)
- 💡 [Suggest Features](https://github.com/estjs/essor/discussions)
- 📝 [Submit PRs](https://github.com/estjs/essor/pulls)
- 📚 [Improve Documentation](https://github.com/estjs/essor/tree/main/docs)

### Development Setup

```bash
git clone https://github.com/estjs/essor.git
cd essor

pnpm install
pnpm dev       # Watch mode
pnpm test      # Unit tests
pnpm test:e2e  # E2E tests
pnpm build     # Build all packages
```

## 📄 License

[MIT License](./LICENSE)

---

<div align="center">

**If this project helps you, please give us a ⭐️**

[GitHub](https://github.com/estjs/essor) | [Documentation](https://essor.netlify.app/) | [Discussions](https://github.com/estjs/essor/discussions)

</div>
