import { type NodePath, types as t } from '@babel/core';
import type { State } from './types';
export const imports = new Set<string>();

export const transformProgram = {
  enter(path: NodePath<t.Program>, state) {
    imports.clear();

    path.state = {
      h: path.scope.generateUidIdentifier('h$'),
      renderTemplate: path.scope.generateUidIdentifier('renderTemplate$'),
      template: path.scope.generateUidIdentifier('template$'),

      useSignal: path.scope.generateUidIdentifier('signal$'),
      useComputed: path.scope.generateUidIdentifier('computed$'),
      useReactive: path.scope.generateUidIdentifier('reactive$'),

      tmplDeclaration: t.variableDeclaration('const', []),
      opts: state.opts,
    } as State;
  },
  exit(path: NodePath<t.Program>) {
    const state: State = path.state;
    if (state.tmplDeclaration.declarations.length > 0) {
      const index = path.node.body.findIndex(
        node => !t.isImportDeclaration(node) && !t.isExportDeclaration(node),
      );
      path.node.body.splice(index, 0, state.tmplDeclaration);
    }
    if (imports.size > 0) {
      path.node.body.unshift(createImport(state, 'essor'));
    }
  },
};
function createImport(state: State, from: string) {
  const ImportSpecifier: t.ImportSpecifier[] = [];
  imports.forEach(name => {
    const local = t.identifier(state[name].name);
    const imported = t.identifier(name);
    ImportSpecifier.push(t.importSpecifier(local, imported));
  });

  const importSource = t.stringLiteral(from);
  return t.importDeclaration(ImportSpecifier, importSource);
}
