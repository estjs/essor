# @estjs/signals

A high-performance, fine-grained reactivity library for **Essor**. It can also be used as a standalone library for managing state in any JavaScript application.

## Installation

```bash
npm install @estjs/signals
```

## Usage

```ts
import { computed, effect, signal } from '@estjs/signals';

const count = signal(0);
const double = computed(() => count.value * 2);

effect(() => {
  console.log(`Count: ${count.value}, Double: ${double.value}`);
});

count.value++; // Logs: Count: 1, Double: 2
```


## License

MIT
