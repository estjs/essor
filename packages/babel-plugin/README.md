# est babel plugin

## Install

```bash
npm install babel-plugin-est --save-dev
```

## Usage

```js
import estBabelPlugin from 'babel-plugin-est';
{
  "plugins": [[estBabelPlugin,pluginOptions]]
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
