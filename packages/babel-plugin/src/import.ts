import { type NodePath, types as t } from '@babel/core';
import { error } from '@estjs/shared';
import { IMPORTS_MAPS, RENDER_MODE, SSG_IMPORTS_MAPS, SSR_IMPORTS_MAPS } from './constants';
import type { PluginState } from './types';

export type IMPORT_MAP_NAMES = (typeof IMPORTS_MAPS)[number];
/**
 * Generates a set of unique import identifiers for a given program path.

 * @param path - The program path used to generate unique identifiers.
 * @returns A record mapping import names to their corresponding unique identifiers.
 * @throws Will throw an error if identifier generation fails for any import.
 */
export function createImportIdentifiers(path: NodePath<t.Program>) {
  // Initialize all required identifiers
  const identifiers = IMPORTS_MAPS.reduce<Record<string, t.Identifier>>((acc, name) => {
    // Generate unique identifier
    const identifier = path.scope?.generateUidIdentifier(`${name}$`) ?? t.identifier(`${name}$`);

    // Ensure identifier is valid
    if (!identifier) {
      throw new Error(`Failed to generate identifier for ${name}`);
    }
    acc[name] = identifier;
    return acc;
  }, {});

  return identifiers;
}
export const importMap = IMPORTS_MAPS.reduce(
  (acc, name) => ({ ...acc, [name]: name }),
  {},
) as Record<IMPORT_MAP_NAMES, IMPORT_MAP_NAMES>;

// imported sets
export const importedSets = new Set<IMPORT_MAP_NAMES>();

/**
 * Adds the given import name to the set of imported names.
 *
 * @param name The name of the import to add.
 */
export function addImport(name: IMPORT_MAP_NAMES): void {
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
  const state = path.state as PluginState;

  const { mode } = state.opts;

  // Return early if no functions to import
  if (!importedSets.size) {
    return;
  }
  try {
    // Create import specifiers
    const importSpecifiers = Array.from(importedSets).map(name => {
      const importIdentifier = imports[name];
      if (!importIdentifier) {
        throw new Error(`Import identifier not found for: ${name}`);
      }
      const local = t.identifier(importIdentifier.name);
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
  } catch (_error) {
    error('Failed to create import declaration:', _error);
    throw _error;
  }
}
