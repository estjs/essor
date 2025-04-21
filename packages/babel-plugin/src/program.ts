import { type NodePath, types as t } from '@babel/core';
import { clearImport, createImport, createImportIdentifiers } from './import';
import { DEFAULT_OPTIONS } from './constants';
import type { State } from './types';

export const transformProgram = {
  enter(path: NodePath<t.Program>, state) {
    const mergedOption = { ...DEFAULT_OPTIONS, ...state.opts };

    const identifiers = createImportIdentifiers(path);

    clearImport();

    path.state = {
      ...state,
      ...mergedOption,
      imports: identifiers,
      templateDeclaration: t.variableDeclaration('const', []),
    };
  },
  exit(path: NodePath<t.Program>) {
    const { templateDeclaration, imports } = path.state as State;

    // Insert template declaration (if exists)
    if (templateDeclaration.declarations.length > 0) {
      // Find the first non-import/non-export declaration
      const insertIndex = path.node.body.findIndex(
        node => !t.isImportDeclaration(node) && !t.isExportDeclaration(node),
      );

      // Insert template declaration
      if (insertIndex !== -1) {
        path.node.body.splice(insertIndex, 0, templateDeclaration);
      } else {
        path.node.body.push(templateDeclaration);
      }
    }

    // Choose import path based on rendering mode
    const importPath =
      (path.state as State).opts.mode === 'client' ? 'essor' : '@estjs/server';

    createImport(path, imports, importPath);
  },
};
