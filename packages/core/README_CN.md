# @estjs/core

**Essor** 框架的核心运行时。它提供了应用初始化逻辑，并将响应式系统与渲染引擎集成在一起。

## 安装

```bash
npm install essor
```

## 使用

```tsx
import { createApp, signal } from 'essor';

function App() {
  const count = signal(0);
  return <button onclick={() => count.value++}>{count.value}</button>;
}

createApp(App, document.body);
```


## 许可证

MIT
