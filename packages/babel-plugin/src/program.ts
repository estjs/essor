import { type NodePath, types as t } from '@babel/core';
import { addImport, clearImport, createImport, createImportIdentifiers, importMap } from './import';
import { DEFAULT_OPTIONS, RENDER_MODE } from './constants';

// ============================================
// Virtual module path - unified use of virtual:essor-hmr
// ============================================
function getHmrModulePath(): string {
  return '/@essor-refresh';
}
// ============================================
// Create import identifier
// ============================================
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
  },

  exit: (path: NodePath<t.Program>, state) => {
    const { imports, declarations, events, opts } = path.state;
    const mode = (opts?.mode || RENDER_MODE.CLIENT) as RENDER_MODE;

    // Find optimal insertion point after imports but before other code
    const insertIndex = path.node.body.findIndex(
      node => !t.isImportDeclaration(node) && !t.isExportDeclaration(node),
    );

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

    // Generate and insert required import statements
    createImport(path, imports, 'essor');
  },
};
