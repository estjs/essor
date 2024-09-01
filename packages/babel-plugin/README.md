# Essor babel plugin

## Install

```bash
npm install babel-plugin-essor --save-dev
```

## Usage

```js
import EssorBabelPlugin from 'babel-plugin-essor';
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
