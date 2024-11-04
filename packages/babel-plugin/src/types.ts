import type { types as t } from '@babel/core';

export interface State {
  h: t.Identifier;
  template: t.Identifier;
  ssg: t.Identifier;
  Fragment: t.Identifier;

  signal: t.Identifier;
  computed: t.Identifier;
  reactive: t.Identifier;

  tmplDeclaration: t.VariableDeclaration;
  opts: Options;
}

export interface Options {
  ssg: boolean;
  symbol: string;
  props: boolean;
}
