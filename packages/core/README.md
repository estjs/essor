# @estjs/core

The core runtime for the **Essor** framework. It provides the application initialization logic and integrates the reactivity system with the rendering engine.

## Installation

```bash
npm install essor
```

## Usage

```tsx
import { createApp, signal } from 'essor';

function App() {
  const count = signal(0);
  return <button onclick={() => count.value++}>{count.value}</button>;
}

createApp(App, document.body);
```


## License

MIT
