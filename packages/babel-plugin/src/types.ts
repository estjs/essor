import type { types as t } from '@babel/core';

export interface State {
  h: t.Identifier;
  template: t.Identifier;
  ssg: t.Identifier;
  Fragment: t.Identifier;

  useSignal: t.Identifier;
  useComputed: t.Identifier;
  useReactive: t.Identifier;

  tmplDeclaration: t.VariableDeclaration;
  opts: Options;
}

export interface Options {
  server: boolean;
  symbol: string;
  props: boolean;
}
