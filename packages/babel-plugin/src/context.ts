import { type NodePath, types as t } from '@babel/core';
import { type PluginOptions, RENDER_MODE, type RenderMode } from './options';
import {
  HYDRATE_IMPORT_REMAPS,
  IMPORTS_MAPS,
  type IMPORT_MAP_NAMES,
  SERVER_IMPORT_REMAPS,
  UNIVERSAL_IMPORTS,
} from './constants';

export interface CompileContext {
  options: PluginOptions;
  programPath: NodePath<t.Program>;
  delegateEvents: Set<string>;
  imports: Set<IMPORT_MAP_NAMES>;
  importIdentifiers: Record<IMPORT_MAP_NAMES, t.Identifier>;
  signalBindings: WeakSet<object>;
  declarations: Map<string, t.Identifier>;
  hmrComponents: Set<string>;
  hmrSignatures: Map<string, string>;
  profile: RenderMode;
}

let currentCompileContext: CompileContext | null = null;

/**
 * Returns the active compile context.
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
 * Passing `null` resets the context. Passing a new context while another is
 * still active is treated as a programmer error: in DEV builds we throw so the
 * concurrent-file pollution is caught early; in production we still overwrite
 * to avoid breaking working pipelines.
 */
export function setCompileContext(context: CompileContext | null): void {
  if (__DEV__ && context && currentCompileContext) {
    throw new Error(
      'setCompileContext: overwriting existing context — possible concurrent file processing',
    );
  }
  currentCompileContext = context;
}

/**
 * Creates and stores the compile context for the current program.
 */
export function createCompileContext(
  options: PluginOptions,
  programPath: NodePath<t.Program>,
): CompileContext {
  const next: CompileContext = {
    options,
    programPath,
    delegateEvents: new Set(),
    imports: new Set<IMPORT_MAP_NAMES>(),
    importIdentifiers: createImportIdentifiers(programPath, options.mode!),
    signalBindings: new WeakSet(),
    declarations: new Map(),
    hmrComponents: new Set(),
    hmrSignatures: new Map(),
    profile: options.mode!,
  };
  setCompileContext(next);
  return next;
}

export function addDelegatedEvent(eventName: string): void {
  getCompileContext().delegateEvents.add(eventName);
}

/** Marks a runtime helper as used and returns its import identifier. */
export function useImport(name: IMPORT_MAP_NAMES): t.Identifier {
  const ctx = getCompileContext();
  ctx.imports.add(name);
  return ctx.importIdentifiers[name];
}

/** Generates a unique identifier inside the current program scope. */
export function genUid(prefix: string): t.Identifier {
  const { programPath } = getCompileContext();
  return programPath.scope?.generateUidIdentifier(prefix) ?? t.identifier(prefix);
}

/** Registers a template and returns its identifier. */
export function registerTemplate(templateStr: string): t.Identifier {
  const ctx = getCompileContext();
  const cacheKey = `template:${templateStr}`;
  const cached = ctx.declarations.get(cacheKey);
  if (cached) return cached;

  const id = genUid('_t$');
  const templateCallee = useImport('template');
  ctx.programPath.node.body.unshift(
    t.variableDeclaration('const', [
      t.variableDeclarator(id, t.callExpression(templateCallee, [t.stringLiteral(templateStr)])),
    ]),
  );
  ctx.declarations.set(cacheKey, id);
  return id;
}

/**
 * Registers a top-level declaration and returns its identifier.
 *
 * Caching is only enabled for arrays whose elements are fully serializable
 * (string literals). Non-serializable elements disable caching to avoid key
 * collisions between structurally different arrays.
 */
export function registerDeclaration(
  expression: t.Expression,
  options: { uidBase?: string; preferredId?: t.Identifier } = {},
): t.Identifier {
  const ctx = getCompileContext();
  const cacheKey = computeDeclarationCacheKey(expression);

  if (cacheKey) {
    const cached = ctx.declarations.get(cacheKey);
    if (cached) return cached;
  }

  const id = options.preferredId ?? genUid(options.uidBase ?? 'decl$');
  ctx.programPath.node.body.unshift(
    t.variableDeclaration('const', [t.variableDeclarator(id, expression)]),
  );

  if (cacheKey) ctx.declarations.set(cacheKey, id);
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
      parts.push(' null');
      continue;
    }
    if (t.isStringLiteral(el)) {
      parts.push(`s:${el.value}`);
      continue;
    }
    return '';
  }
  return `decl:[${parts.join('|')}]`;
}

const REMAPS_BY_MODE: Record<RenderMode, Partial<Record<IMPORT_MAP_NAMES, string>>> = {
  [RENDER_MODE.CLIENT]: {},
  [RENDER_MODE.SERVER]: SERVER_IMPORT_REMAPS as Partial<Record<IMPORT_MAP_NAMES, string>>,
  [RENDER_MODE.HYDRATE]: HYDRATE_IMPORT_REMAPS as Partial<Record<IMPORT_MAP_NAMES, string>>,
};

function resolveImportedName(name: IMPORT_MAP_NAMES, mode: RenderMode): string {
  return REMAPS_BY_MODE[mode]?.[name] ?? name;
}

/**
 * Generates a set of unique import identifiers for the program scope.
 */
export function createImportIdentifiers(
  path: NodePath<t.Program>,
  mode: RenderMode,
): Record<IMPORT_MAP_NAMES, t.Identifier> {
  const out = {} as Record<IMPORT_MAP_NAMES, t.Identifier>;
  for (const name of IMPORTS_MAPS) {
    const importedName = resolveImportedName(name, mode);
    out[name] =
      path.scope?.generateUidIdentifier(`${importedName}$`) ?? t.identifier(`${importedName}$`);
  }
  return out;
}

/** Emits the import declaration(s) collected during compilation. */
export function createImport(path: NodePath<t.Program>): void {
  const ctx = getCompileContext();
  if (!ctx.imports.size) return;

  const { mode } = ctx.options;

  const emit = (names: IMPORT_MAP_NAMES[], source: string): void => {
    if (!names.length) return;
    const specifiers = names.map((name) =>
      t.importSpecifier(
        ctx.importIdentifiers[name],
        t.identifier(resolveImportedName(name, mode!)),
      ),
    );
    path.node.body.unshift(t.importDeclaration(specifiers, t.stringLiteral(source)));
  };

  if (mode === RENDER_MODE.SERVER) {
    // Reactivity comes from `'essor'` (shared, deduped signals); SSR render
    // helpers come from `'essor/server'`. `emit` unshifts, so emitting server
    // first then universal leaves `'essor'` as the first import line.
    const universal: IMPORT_MAP_NAMES[] = [];
    const server: IMPORT_MAP_NAMES[] = [];
    for (const name of ctx.imports) {
      (UNIVERSAL_IMPORTS.has(name) ? universal : server).push(name);
    }
    emit(server, 'essor/server');
    emit(universal, 'essor');
  } else {
    emit([...ctx.imports], 'essor');
  }
}
