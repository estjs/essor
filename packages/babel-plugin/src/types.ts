import type { types as t } from '@babel/core';

export interface State {
  h: t.Identifier;
  template: t.Identifier;
  ssrtmpl: t.Identifier;
  ssr: t.Identifier;
  tmplDeclaration: t.VariableDeclaration;
  opts: Options;
}

export interface Options {
  ssr: false;
  symbol: false;
}
