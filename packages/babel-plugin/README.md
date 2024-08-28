# Essor babel plugin

## Install

```bash
npm install @essor/babel-plugin --save-dev
```

## Usage

```js
import EssorBabelPlugin from '@essor/babel-plugin';
{
  "plugins": [[EssorBabelPlugin,pluginOptions]]
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
