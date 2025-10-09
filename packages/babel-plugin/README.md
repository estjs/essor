# essor babel plugin

## Install

```bash
npm install babel-plugin-essor --save-dev
```

## Usage

```js
import BabelPlugin from 'babel-plugin-essor';
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
