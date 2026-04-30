import { error } from '@estjs/shared';
import { type NodePath, types as t } from '@babel/core';
import { type PluginOptions, RENDER_MODE, type RenderMode } from './options';
import {
  HYDRATE_IMPORT_REMAPS,
  IMPORTS_MAPS,
  type IMPORT_MAP_NAMES,
  SERVER_EXPORTS,
  SERVER_IMPORT_REMAPS,
} from './constants';
export interface CompileContext {
  options: PluginOptions;
  programPath: NodePath<t.Program>;
  delegateEvents: Set<string>;
  imports: Set<IMPORT_MAP_NAMES>;
  importIdentifiers: Record<IMPORT_MAP_NAMES, t.Identifier>;
  declarations: Map<string, t.Identifier>;
  hmrComponents: Set<string>;
  hmrSignatures: Map<string, string>;
  profile: RenderMode;
}
let currentCompileContext: CompileContext | null = null;
/**
 * Returns the active compile context.
 *
 * @returns {CompileContext} The active compile context.
 */
export function getCompileContext(): CompileContext {
  if (!currentCompileContext) {
    throw new Error(
      'getCompileContext: no active compile context — compile() must be called first',
    );
  }
  return currentCompileContext;
}
/**
 * Sets the active compile context for the current file pass.
 *
 * @param context - The context to set as active.
 * @returns {void}
 */
export function setCompileContext(context: CompileContext | null) {
  if (__DEV__ && context && currentCompileContext) {
    error('setCompileContext: overwriting existing context — possible concurrent file processing');
  }
  currentCompileContext = context;
}
/**
 * Creates and stores the compile context for the current program.
 *
 * @param options - The plugin options.
 * @param programPath - The NodePath of the Program node.
 * @returns {CompileContext} The created compile context.
 */
export function createCompileContext(
  options: PluginOptions,
  programPath: NodePath<t.Program>,
): CompileContext {
  const ctx: CompileContext = {
    options,
    programPath,
    delegateEvents: new Set(),
    imports: new Set<IMPORT_MAP_NAMES>(),
    importIdentifiers: createImportIdentifiers(programPath, options.mode!) as Record<
      IMPORT_MAP_NAMES,
      t.Identifier
    >,
    declarations: new Map(),
    hmrComponents: new Set(),
    hmrSignatures: new Map(),
    profile: options.mode!,
  };
  setCompileContext(ctx);
  return ctx;
}

/**
 * Records a delegated event name for later runtime emission.
 *
 * @param eventName - The name of the event to delegate.
 * @returns {void}
 */
export function addDelegatedEvent(eventName: string) {
  currentCompileContext!.delegateEvents.add(eventName);
}
/**
 * Marks a runtime helper as used and returns its import identifier.
 *
 * @param name - The name of the helper to import.
 * @returns {t.Identifier} The import identifier.
 */
export function useImport(name: IMPORT_MAP_NAMES) {
  currentCompileContext!.imports.add(name);
  return currentCompileContext!.importIdentifiers[name];
}
/**
 * Generates a unique identifier inside the current program scope.
 *
 * @param prefix - The prefix for the unique identifier.
 * @returns {t.Identifier} The generated identifier.
 */
export function genUid(prefix: string) {
  return (
    currentCompileContext!.programPath.scope?.generateUidIdentifier(prefix) ?? t.identifier(prefix)
  );
}
/**
 * Registers a template and returns its identifier.
 *
 * @param templateStr - The template HTML string.
 * @returns {t.Identifier} The identifier for the registered template.
 */
export function registerTemplate(templateStr: string) {
  const cacheKey = `template:${templateStr}`;
  if (currentCompileContext!.declarations.has(cacheKey)) {
    return currentCompileContext!.declarations.get(cacheKey)!;
  }

  const id = genUid('_t$');
  const templateCallee = useImport('template');
  const declaration = t.variableDeclaration('const', [
    t.variableDeclarator(id, t.callExpression(templateCallee, [t.stringLiteral(templateStr)])),
  ]);
  currentCompileContext!.programPath.node.body.unshift(declaration);
  currentCompileContext!.declarations.set(cacheKey, id);
  return id;
}
/**
 * Registers a declaration and returns its identifier.
 *
 * Caching is only enabled for arrays whose elements are fully serializable
 * (string literals). Any non-serializable element disables caching to avoid
 * key collisions between structurally different arrays.
 */
export function registerDeclaration(
  expression: t.Expression,
  options: { uidBase?: string; preferredId?: t.Identifier } = {},
) {
  const cacheKey = computeDeclarationCacheKey(expression);

  if (cacheKey && currentCompileContext!.declarations.has(cacheKey)) {
    return currentCompileContext!.declarations.get(cacheKey)!;
  }

  const id = options.preferredId ?? genUid(options.uidBase ?? 'decl$');
  const declaration = t.variableDeclaration('const', [t.variableDeclarator(id, expression)]);
  currentCompileContext!.programPath.node.body.unshift(declaration);

  if (cacheKey) {
    currentCompileContext!.declarations.set(cacheKey, id);
  }
  return id;
}

/**
 * Computes a stable cache key for declaration deduplication.
 * Returns an empty string when the expression cannot be safely keyed.
 */
function computeDeclarationCacheKey(expression: t.Expression): string {
  if (!t.isArrayExpression(expression)) return '';
  const parts: string[] = [];
  for (const el of expression.elements) {
    if (el == null) {
      parts.push('\u0000null');
      continue;
    }
    if (t.isStringLiteral(el)) {
      parts.push(`s:${el.value}`);
      continue;
    }
    // Any non-string-literal element disables caching to prevent collisions.
    return '';
  }
  return `decl:[${parts.join('|')}]`;
}

/**
 * Resolves imported name.
 */
function resolveImportedName(name: IMPORT_MAP_NAMES, mode: RenderMode): string {
  if (mode === RENDER_MODE.CLIENT) {
    return name;
  }

  if (mode === RENDER_MODE.SERVER) {
    return (SERVER_IMPORT_REMAPS as Partial<Record<IMPORT_MAP_NAMES, string>>)[name] ?? name;
  }

  if (mode === RENDER_MODE.HYDRATE) {
    return (HYDRATE_IMPORT_REMAPS as Partial<Record<IMPORT_MAP_NAMES, string>>)[name] ?? name;
  }

  return name;
}

/**
 * Generates a set of unique import identifiers for a given program path.
 *
 * @param path - The program path used to generate unique identifiers.
 * @param mode - The current render mode.
 * @returns {Record<string, t.Identifier>} A record mapping import names to their corresponding identifiers.
 */
export function createImportIdentifiers(path: NodePath<t.Program>, mode: RenderMode) {
  const identifiers = IMPORTS_MAPS.reduce<Record<string, t.Identifier>>((acc, name) => {
    const importedName = resolveImportedName(name, mode);
    acc[name] =
      path.scope?.generateUidIdentifier(`${importedName}$`) ?? t.identifier(`${importedName}$`);
    return acc;
  }, {});

  return identifiers;
}

/**
 * Creates an import declaration for given program path.
 *
 * @param {NodePath<t.Program>} path The program path
 */
export function createImport(path: NodePath<t.Program>): void {
  const { mode } = currentCompileContext!.options;

  // Return early if no functions to import
  if (!currentCompileContext!.imports.size) {
    return;
  }
  const serverSpecifiers: t.ImportSpecifier[] = [];
  const clientSpecifiers: t.ImportSpecifier[] = [];

  // Create import specifiers
  for (const name of currentCompileContext!.imports) {
    const local = currentCompileContext!.importIdentifiers[name];
    const importedName = resolveImportedName(name, mode!);
    const imported = t.identifier(importedName);
    const specifier = t.importSpecifier(local, imported);

    if (mode === RENDER_MODE.SERVER && SERVER_EXPORTS.has(importedName)) {
      serverSpecifiers.push(specifier);
    } else {
      clientSpecifiers.push(specifier);
    }
  }

  // Create and insert import declarations at program start
  if (serverSpecifiers.length > 0) {
    path.node.body.unshift(t.importDeclaration(serverSpecifiers, t.stringLiteral('essor/server')));
  }
  if (clientSpecifiers.length > 0) {
    path.node.body.unshift(t.importDeclaration(clientSpecifiers, t.stringLiteral('essor')));
  }
}
