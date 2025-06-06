# essor babel plugin

## Install

```bash
npm install @estjs/babel-plugin --save-dev
```

## Usage

```js
import BabelPlugin from '@estjs/babel-plugin';
{
  "plugins": [[BabelPlugin,pluginOptions]]
}
```

## Options

```json
{
  // translate signal symbol,default "$"
  "symbol":"$",
  // enable ssg, dot use it,not a stable API
  "ssg":false,
  // enable props translate,default true
  "props":true
}
