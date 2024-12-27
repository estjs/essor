# aube babel plugin

## Install

```bash
npm install babel-plugin-aube --save-dev
```

## Usage

```js
import aubeBabelPlugin from 'babel-plugin-aube';
{
  "plugins": [[aubeBabelPlugin,pluginOptions]]
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
