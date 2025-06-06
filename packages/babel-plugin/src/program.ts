import { type NodePath, types as t } from '@babel/core';
import { coerceArray } from '@estjs/shared';
import { clearImport, createImport, createImportIdentifiers } from './import';
import { DEFAULT_OPTIONS, RENDER_MODE } from './constants';
import { clearTemplateMaps, getTemplateMaps } from './jsx/context';
import type { State } from './types';

/**
 * Program transformer
 *
 *  enter
 *       1.set global state
 *       2.set options
 *       3.add template declaration
 *       4.create import identifiers
 *
 *   exit
 *       1.insert template declaration
 *       2.create import
 */
export const transformProgram = {
  enter(path: NodePath<t.Program>, state) {
    // Merge options
    const mergedOption = { ...DEFAULT_OPTIONS, ...state.opts };

    // create import identifiers
    const identifiers = createImportIdentifiers(path);

    // clear previous import
    clearImport();

    // clear template
    clearTemplateMaps();

    // set global state
    path.state = {
      ...state,
      ...mergedOption,
      imports: identifiers,
      filename: state.filename,
    };
  },
  exit(path: NodePath<t.Program>) {
    const { imports, opts } = path.state as State;
    const mode = (opts?.mode || RENDER_MODE.CLIENT) as RENDER_MODE;
    const templateMaps = getTemplateMaps();
    // Insert template declaration (if exists)
    if (templateMaps.length > 0) {
      // Find the first non-import/non-export declaration
      const insertIndex = path.node.body.findIndex(
        node => !t.isImportDeclaration(node) && !t.isExportDeclaration(node),
      );
      const template = templateMaps.map(templates => {
        // ssg  template is array
        return mode === RENDER_MODE.SSG
          ? t.variableDeclarator(
              templates.id,
              t.arrayExpression(
                coerceArray(templates.template).map(template => t.stringLiteral(template)),
              ),
            )
          : t.variableDeclarator(
              templates.id,
              t.callExpression(
                imports.template,
                coerceArray(templates.template).map(t.stringLiteral),
              ),
            );
      });

      const templateDeclaration = t.variableDeclaration('const', template);
      // Insert template declaration
      if (insertIndex !== -1) {
        path.node.body.splice(insertIndex, 0, templateDeclaration);
      } else {
        path.node.body.push(templateDeclaration);
      }
    }
    // Choose import path based on rendering mode
    // const importPath =
    //   (path.state as State).opts.mode === 'client' ? 'essor' : '@estjs/server';
    createImport(path, imports, 'essor');
  },
};
