# Essor - Next Generation Frontend Framework

<div align="center">

![Essor Logo](logo.svg)

**🚀 It's just JavaScript - Instant start, ultimate performance, no complex concepts**

[![npm version](https://img.shields.io/npm/v/essor.svg)](https://www.npmjs.com/package/essor)
[![npm downloads](https://img.shields.io/npm/dm/essor.svg)](https://www.npmjs.com/package/essor)
[![GitHub license](https://img.shields.io/github/license/estjs/essor.svg)](https://github.com/estjs/essor/blob/main/LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/estjs/essor.svg)](https://github.com/estjs/essor/issues)
![codecov](https://img.shields.io/codecov/c/github/estjs/essor)
![ci](https://img.shields.io/github/actions/workflow/status/estjs/essor/ci.yml?label=CI&logo=GitHub)

English | [简体中文](./README_CN.md)

</div>

## ✨ Features

- 🚀 **Ultimate Performance** - Signal-based reactive system, no virtual DOM
- 🎯 **Zero Config** - Works out of the box, no complex configuration
- 🔧 **TypeScript** - Full TypeScript support
- 🎨 **JSX Support** - Familiar JSX syntax, easy to learn
- 📦 **Modular** - Tree-shakable, tiny bundle size
- 🌐 **SSR/SSG** - Server-side rendering and static site generation support
- 🔄 **HMR** - Hot module replacement, excellent development experience
- 🛠️ **Toolchain** - Complete build toolchain support


## 🚀 Quick Start

### 1. Create Project

```bash
# Using create-essor
npm create essor@latest my-app

# Or install manually
npm install essor
```

### 2. Write Component

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

### 3. Start Development Server

```bash
npm run dev
```

## 📚 Documentation

- [Documentation](https://essor.netlify.app/)
- [API Reference](https://essor.netlify.app/api)
- [Examples](./examples)
- [Online Playground](https://essor-playground.netlify.app/)

## 🎯 Examples

Check out the [examples](./examples) directory for more examples:

- [Basic Example](./examples/basic) - Getting started
- [Todo App](./examples/todo) - Complete application
- [SSR Example](./examples/ssr) - Server-side rendering
- [SSG Example](./examples/ssg) - Static site generation
- [Suspense Example](./examples/suspense) - Async components
- [Portal Example](./examples/portal) - Portal components


## 🤝 Contributing

We welcome all forms of contributions!

- 🐛 [Report Bugs](https://github.com/estjs/essor/issues)
- 💡 [Suggest Features](https://github.com/estjs/essor/discussions)
- 📝 [Submit PRs](https://github.com/estjs/essor/pulls)
- 📚 [Improve Documentation](https://github.com/estjs/essor/tree/main/docs)

### Development Setup

```bash
# Clone repository
git clone https://github.com/estjs/essor.git
cd essor

# Install dependencies
pnpm install

# Start development mode
pnpm dev

# Run tests
pnpm test

# Build project
pnpm build
```

## 📄 License

[MIT License](./LICENSE)

## 🙏 Acknowledgments

Thanks to all developers who contributed to Essor!

---

<div align="center">

**If this project helps you, please give us a ⭐️**

[GitHub](https://github.com/estjs/essor) | [Documentation](https://essor.netlify.app/) | [Discussions](https://github.com/estjs/essor/discussions)

</div>

