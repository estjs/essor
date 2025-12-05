# unplugin-essor

The unplugin wrapper for **Essor**. It allows you to use the Essor Babel plugin with various build tools like Vite, Webpack, Rollup, and more.

## Installation

```bash
npm install -D unplugin-essor
```

## Usage

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

## License

MIT
