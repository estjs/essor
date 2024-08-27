import type { types as t } from '@babel/core';

export interface State {
  h: t.Identifier;
  template: t.Identifier;
  renderTemplate: t.Identifier;

  useSignal: t.Identifier;
  useComputed: t.Identifier;
  useReactive: t.Identifier;

  tmplDeclaration: t.VariableDeclaration;
  opts: Options;
}

export interface Options {
  ssg: boolean;
  symbol: string;
  props: boolean;
}
