# @estjs/signals

为 **Essor** 打造的高性能、细粒度响应式库。它也可以作为独立的库，用于管理任何 JavaScript 应用中的状态。

## 安装

```bash
npm install @estjs/signals
```

## 使用

```ts
import { computed, effect, signal } from '@estjs/signals';

const count = signal(0);
const double = computed(() => count.value * 2);

effect(() => {
  console.log(`Count: ${count.value}, Double: ${double.value}`);
});

count.value++; // 输出: Count: 1, Double: 2
```


## 许可证

MIT
