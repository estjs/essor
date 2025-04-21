import { type NodePath, types as t } from '@babel/core';
import { USED_IMPORTS } from './constants';
import type { ImportsNames } from './types';
export function createImportIdentifiers(path: NodePath<t.Program>) {
  // Initialize all required identifiers
  const identifiers = USED_IMPORTS.reduce<Record<string, t.Identifier>>((acc, name) => {
    // Generate unique identifier
    const identifier = path.scope.generateUidIdentifier(`${name}$`);

    // Ensure identifier is valid
    if (!identifier) {
      throw new Error(`Failed to generate identifier for ${name}`);
    }

    acc[name] = identifier;
    return acc;
  }, {});

  return identifiers;
}
// import object
export const importObject = USED_IMPORTS.reduce(
  (acc, name) => ({ ...acc, [name]: name }),
  {},
) as Record<ImportsNames, ImportsNames>;

export const importedSets = new Set<ImportsNames>();

// add import
export function addImport(name: ImportsNames): void {
  importedSets.add(name);
}
export function clearImport(): void {
  importedSets.clear();
}
/**
 * Creates an import declaration for given program path.
 *
 * @param {NodePath<t.Program>} path The program path
 * @param {Record<string, t.Identifier>} imports Imported identifiers
 * @param {string} from The module path to import
 */

export function createImport(
  path: NodePath<t.Program>,
  imports: Record<string, t.Identifier>,
  from: string,
): void {
  // Return early if no functions to import
  if (!importedSets.size) {
    return;
  }
  try {
    // Create import specifiers
    const importSpecifiers = Array.from(importedSets).map(name => {
      const local = t.identifier(imports[name].name);
      const imported = t.identifier(name);
      return t.importSpecifier(local, imported);
    });

    // Create and insert import declaration at program start
    const importDeclaration = t.importDeclaration(importSpecifiers, t.stringLiteral(from));

    path.node.body.unshift(importDeclaration);
  } catch (error) {
    console.error('Failed to create import declaration:', error);
    throw error;
  }
}
