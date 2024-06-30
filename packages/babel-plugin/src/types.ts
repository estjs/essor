import type { types as t } from '@babel/core';

export interface State {
  h: t.Identifier;
  template: t.Identifier;
  renderTemplate: t.Identifier;
  tmplDeclaration: t.VariableDeclaration;
  opts: Options;
}

export interface Options {
  ssg: false;
  symbol: false;
}
