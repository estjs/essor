import { type NodePath, types as t } from '@babel/core';
import { RENDER_MODE, SSG_IMPORTS_MAPS, SSR_IMPORTS_MAPS, USED_IMPORTS } from './constants';
import type { ImportsNames, State } from './types';

/**
 * Generates a set of unique import identifiers for a given program path.
 *
 * This function iterates over the list of used imports and creates a unique
 * identifier for each one. It ensures that each identifier is valid and throws
 * an error if any identifier generation fails.
 *
 * @param path - The program path used to generate unique identifiers.
 * @returns A record mapping import names to their corresponding unique identifiers.
 * @throws Will throw an error if identifier generation fails for any import.
 */

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
export const importMap = USED_IMPORTS.reduce(
  (acc, name) => ({ ...acc, [name]: name }),
  {},
) as Record<ImportsNames, ImportsNames>;

// imported sets
export const importedSets = new Set<ImportsNames>();

/**
 * Adds the given import name to the set of imported names.
 *
 * @param name The name of the import to add.
 */
export function addImport(name: ImportsNames): void {
  importedSets.add(name);
}

/**
 * Clears the set of imported names.
 *
 * This function is useful when the state of the imported names needs to be reset.
 * It will be called when the babel plugin is finished processing the current
 * file.
 */
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
  const state = path.state as State;

  const mode = state.opts.mode;

  // Return early if no functions to import
  if (!importedSets.size) {
    return;
  }
  try {
    // Create import specifiers
    const importSpecifiers = Array.from(importedSets).map(name => {
      const local = t.identifier(imports[name].name);
      if (mode === RENDER_MODE.SSG) {
        name = SSG_IMPORTS_MAPS[name] || name;
      }
      if (mode === RENDER_MODE.SSR) {
        name = SSR_IMPORTS_MAPS[name] || name;
      }
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
