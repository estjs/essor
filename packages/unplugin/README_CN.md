# unplugin-essor

**Essor** 的 unplugin 封装。它允许你在 Vite、Webpack、Rollup 等多种构建工具中使用 Essor Babel 插件。

## 安装

```bash
npm install -D unplugin-essor
```

## 使用

### Vite

```ts
// vite.config.ts
import Essor from 'unplugin-essor/vite';

export default {
  plugins: [Essor()],
};
```

### Webpack

```js
// webpack.config.js
const Essor = require('unplugin-essor/webpack');

module.exports = {
  plugins: [Essor()],
};
```

## 许可证

MIT
