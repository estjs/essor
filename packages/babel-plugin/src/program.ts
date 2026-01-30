import { type NodePath, types as t } from '@babel/core';
import { addImport, clearImport, createImport, createImportIdentifiers, importMap } from './import';
import { DEFAULT_OPTIONS } from './constants';
import {
  replaceSymbol,
  symbolArrayPattern,
  symbolAssignment,
  symbolIdentifier,
  symbolObjectPattern,
  symbolUpdate,
} from './signals/symbol';
import { generateHmrRegistry, transformCreateComponent, transformHmr } from './hmr';
import type { PluginState } from './types';

function getHmrModulePath(): string {
  return '/@essor-refresh';
}

export function createImportIdentifier(path: babel.NodePath, importName: string): t.Identifier {
  const source = getHmrModulePath();
  const program = path.scope.getProgramParent().path as babel.NodePath<t.Program>;

  // Check if already imported
  let importId: t.Identifier | undefined;

  program.traverse({
    ImportDeclaration(importPath) {
      if (importPath.node.source.value === source) {
        const specifier = importPath.node.specifiers.find(
          spec =>
            t.isImportSpecifier(spec) &&
            t.isIdentifier(spec.imported) &&
            spec.imported.name === importName,
        );
        if (specifier && t.isImportSpecifier(specifier)) {
          importId = specifier.local;
        }
      }
    },
  });

  if (!importId) {
    // Create new import
    importId = path.scope.generateUidIdentifier(importName);
    const importDecl = t.importDeclaration(
      [t.importSpecifier(importId, t.identifier(importName))],
      t.stringLiteral(source),
    );

    // Insert import at the top of program
    program.unshiftContainer('body', importDecl);
  }

  return importId;
}

/**
 * Helper function to automatically set state for visitor paths.
 * This ensures that paths created by traverse() inherit the parent state.
 */
function withState<T>(visitor: (path: NodePath<T>) => void, parentState: any) {
  return (path: NodePath<T>) => {
    path.state = parentState;
    visitor(path);
  };
}

export const transformProgram = {
  enter: (path: NodePath<t.Program>, state) => {
    const opts = { ...DEFAULT_OPTIONS, ...state.opts };
    const imports = createImportIdentifiers(path);

    // Clear any previous import state to ensure clean transformation
    clearImport();

    // Extend path state with plugin-specific data
    path.state = {
      ...state,
      opts,
      imports,
      declarations: [], // Collect template declarations during transformation
      filename: state.filename,
      events: new Set(), // Track delegated events for optimization
    };

    //  Transform signals BEFORE JSX transformation
    // This ensures that when JSX transformer extracts expression.node,
    // signal variables have already been transformed to access .value
    const parentState = path.state;

    path.traverse({
      VariableDeclarator: withState(replaceSymbol, parentState), // let $x = 0 → let $x = signal(0)
      Identifier: withState(symbolIdentifier, parentState), // $x → $x.value
      AssignmentExpression: withState(symbolAssignment, parentState), // $x = 1 → $x.value = 1
      UpdateExpression: withState(symbolUpdate, parentState), // $x++ → $x.value++
      ObjectPattern: withState(symbolObjectPattern, parentState), // { $x } → handle nested patterns
      ArrayPattern: withState(symbolArrayPattern, parentState), // [$x] → handle nested patterns
    });

    if (opts?.hmr && opts?.mode === 'client') {
      path.traverse({
        FunctionDeclaration: withState(transformHmr, parentState), // Inject __hmrId for components
        ArrowFunctionExpression: withState(transformHmr, parentState), // Inject __hmrId for components
      });
    }
  },

  exit: (path: NodePath<t.Program>) => {
    const pluginState: PluginState = path.state as PluginState;
    const { imports, declarations, events, opts } = pluginState;
    // const mode = (opts?.mode || RENDER_MODE.CLIENT) as RENDER_MODE;

    // Find optimal insertion point after imports but before other code
    const insertIndex = path.node.body.findIndex(node => !t.isImportDeclaration(node));

    // Insert template declarations for reactive components
    if (declarations?.length) {
      const templateDeclaration = t.variableDeclaration('const', declarations);

      // Insert at the appropriate location to maintain code organization
      if (insertIndex !== -1) {
        path.node.body.splice(insertIndex, 0, templateDeclaration);
      } else {
        path.node.body.push(templateDeclaration);
      }
    }

    // Setup event delegation for performance optimization
    if (events && events.size > 0) {
      const eventsDeclaration = t.expressionStatement(
        t.callExpression(imports.delegateEvents, [
          t.arrayExpression(Array.from(events).map(event => t.stringLiteral(event))),
        ]),
      );
      addImport(importMap.delegateEvents);
      path.node.body.push(eventsDeclaration);
    }
    // HMR: Generate HMR code
    if (opts?.hmr && opts?.mode === 'client') {
      generateHmrRegistry(path);
      transformCreateComponent(path, imports);
    }

    // Generate and insert required import statements
    createImport(path, imports, 'essor');
  },
};
