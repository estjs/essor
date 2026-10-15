/**
 * HMR transformation.
 *
 * HMR has two separate jobs here:
 *  - mark top-level JSX components with stable metadata; and
 *  - rewrite runtime component/mount call sites to use the HMR boundary.
 *
 * The JSX pass runs after this transform, so generated component calls are
 * emitted by the code generator with the same boundary name. Calls that are
 * already present in user code are handled here.
 */
import { generate } from '@babel/generator';
import * as t from '@babel/types';
import type { NodePath } from '@babel/core';
import type { Binding } from '@babel/traverse';
import type { CompileContext } from '../core/context';

const HMR_COMPONENT_NAME = '__$createHMRComponent$__';
const HMR_REGISTRY_NAME = '__$registry$__';
const ESSOR_IMPORT = 'essor';
const HMR_IMPORTS = new Set(['createApp', 'hydrate', 'createComponent']);
const WHITESPACE_REGEX = /\s+/g;
const PATH_SEPARATOR_REGEX = /[/\\]/;

type AnyFunction = t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression;

type HmrBindings = {
  createComponent: Map<string, Binding>;
  mount: Map<string, Binding>;
};

type HmrState = {
  components: Set<string>;
  signatures: Map<string, string>;
};

// CompileContext intentionally stays small. Keep HMR bookkeeping local while
// also mirroring the old ad-hoc fields for callers that invoke the helpers
// independently.
const stateByContext = new WeakMap<object, HmrState>();

function getHmrState(
  ctx: CompileContext,
  components?: Set<string>,
  signatures?: Map<string, string>,
): HmrState {
  const context = ctx as unknown as object;
  const attached = ctx as CompileContext & {
    hmrComponents?: Set<string>;
    hmrSignatures?: Map<string, string>;
  };
  let state = stateByContext.get(context);

  if (!state) {
    state = {
      components: components ?? attached.hmrComponents ?? new Set<string>(),
      signatures: signatures ?? attached.hmrSignatures ?? new Map<string, string>(),
    };
    stateByContext.set(context, state);
  } else {
    if (components && state.components !== components) state.components = components;
    if (signatures && state.signatures !== signatures) state.signatures = signatures;
  }

  // These assignments are deliberately best-effort. They preserve the API of
  // the previous compiler without requiring the lean context type to grow.
  attached.hmrComponents = state.components;
  attached.hmrSignatures = state.signatures;
  return state;
}

function isHmrEnabled(ctx: CompileContext): boolean {
  const options = ctx.options as CompileContext['options'] & {
    bundler?: string;
  };
  // The bundler gate prevents the Babel plugin from emitting virtual-runtime
  // references when it is used directly outside an unplugin integration.
  return options.hmr === true && !!options.bundler;
}

/** Returns the basename used for stable, cross-machine metadata. */
function getFileBasename(ctx: CompileContext): string {
  const options = ctx.options as CompileContext['options'] & {
    filename?: string;
  };
  const filename = ctx.filename || options.filename || 'unknown.tsx';
  const segments = filename.split(PATH_SEPARATOR_REGEX);
  return segments[segments.length - 1] || filename;
}

/** Small deterministic hash used by the HMR runtime. */
function simpleHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function componentSignature(code: string): string {
  return simpleHash(code.replaceAll(WHITESPACE_REGEX, ' ').trim());
}

function functionBodyCode(path: NodePath<AnyFunction>): string {
  return generate(path.node.body).code;
}

function isFunctionLikeExpressionPath(
  path: NodePath<t.Node | null>,
): path is NodePath<t.FunctionExpression | t.ArrowFunctionExpression> {
  return path.isFunctionExpression() || path.isArrowFunctionExpression();
}

function returnsJSXValue(node: t.Node | null | undefined): boolean {
  if (!node) return false;
  if (t.isJSXElement(node) || t.isJSXFragment(node)) return true;
  if (t.isConditionalExpression(node)) {
    return returnsJSXValue(node.consequent) || returnsJSXValue(node.alternate);
  }
  if (t.isLogicalExpression(node)) {
    return returnsJSXValue(node.left) || returnsJSXValue(node.right);
  }
  if (t.isSequenceExpression(node)) {
    const last = node.expressions[node.expressions.length - 1];
    return returnsJSXValue(last);
  }
  if (t.isArrayExpression(node)) {
    return node.elements.some((element) =>
      element && t.isExpression(element) ? returnsJSXValue(element) : false,
    );
  }
  if (t.isAssignmentExpression(node)) return returnsJSXValue(node.right);
  if (t.isAwaitExpression(node)) return returnsJSXValue(node.argument);
  if (
    t.isParenthesizedExpression(node) ||
    t.isTSAsExpression(node) ||
    t.isTSSatisfiesExpression(node) ||
    t.isTSTypeAssertion(node) ||
    t.isTSNonNullExpression(node)
  ) {
    return returnsJSXValue(node.expression);
  }
  return false;
}

/** Checks only returns in the function itself; nested functions are ignored. */
function checkHasJSXReturn(path: NodePath<AnyFunction>): boolean {
  if (path.isArrowFunctionExpression() && !t.isBlockStatement(path.node.body)) {
    return returnsJSXValue(path.node.body);
  }

  let found = false;
  path.traverse({
    ReturnStatement(returnPath) {
      if (returnsJSXValue(returnPath.node.argument)) {
        found = true;
        returnPath.stop();
      }
    },
    Function(functionPath) {
      if (functionPath.node !== path.node) functionPath.skip();
    },
  });
  return found;
}

function unwrapTopLevelDeclaration(
  statementPath: NodePath<t.Statement | t.ModuleDeclaration>,
): NodePath<t.FunctionDeclaration | t.VariableDeclaration> | null {
  if (statementPath.isFunctionDeclaration() || statementPath.isVariableDeclaration()) {
    return statementPath as NodePath<t.FunctionDeclaration | t.VariableDeclaration>;
  }

  if (statementPath.isExportNamedDeclaration() || statementPath.isExportDefaultDeclaration()) {
    const declarationPath = statementPath.get('declaration');
    if (
      declarationPath &&
      !Array.isArray(declarationPath) &&
      (declarationPath.isFunctionDeclaration() || declarationPath.isVariableDeclaration())
    ) {
      return declarationPath as NodePath<t.FunctionDeclaration | t.VariableDeclaration>;
    }
  }
  return null;
}

function collectFromStatement(
  statementPath: NodePath<t.Statement | t.ModuleDeclaration>,
  ctx: CompileContext,
  components: Set<string>,
  signatures: Map<string, string>,
): void {
  const declarationPath = unwrapTopLevelDeclaration(statementPath);
  if (!declarationPath) return;

  if (declarationPath.isFunctionDeclaration()) {
    const id = declarationPath.node.id;
    if (id && checkHasJSXReturn(declarationPath)) {
      components.add(id.name);
      signatures.set(
        id.name,
        componentSignature(functionBodyCode(declarationPath) + getFileBasename(ctx)),
      );
    }
    return;
  }

  for (const variablePath of declarationPath.get('declarations')) {
    const idPath = variablePath.get('id');
    const initPath = variablePath.get('init');
    if (!idPath.isIdentifier() || !isFunctionLikeExpressionPath(initPath)) continue;
    if (!checkHasJSXReturn(initPath)) continue;

    const name = idPath.node.name;
    components.add(name);
    signatures.set(name, componentSignature(functionBodyCode(initPath) + getFileBasename(ctx)));
  }
}

function isComponentDeclarationExport(
  statementPath: NodePath<t.Statement | t.ModuleDeclaration>,
): boolean {
  const declarationPath = unwrapTopLevelDeclaration(statementPath);
  if (!declarationPath) return false;

  if (declarationPath.isFunctionDeclaration()) return checkHasJSXReturn(declarationPath);
  if (!declarationPath.isVariableDeclaration()) return false;

  const declarations = declarationPath.get('declarations');
  return (
    declarations.length > 0 &&
    declarations.every((variablePath) => {
      const initPath = variablePath.get('init');
      return isFunctionLikeExpressionPath(initPath) && checkHasJSXReturn(initPath);
    })
  );
}

function isTypeOnlyExport(statementPath: NodePath<t.Statement | t.ModuleDeclaration>): boolean {
  if (!statementPath.isExportNamedDeclaration()) return false;
  const { declaration, exportKind, specifiers } = statementPath.node;
  if (exportKind === 'type') return true;
  if (t.isTSTypeAliasDeclaration(declaration) || t.isTSInterfaceDeclaration(declaration)) {
    return true;
  }
  return (
    specifiers.length > 0 &&
    specifiers.every((specifier) => 'exportKind' in specifier && specifier.exportKind === 'type')
  );
}

function hasOnlyComponentSpecifiers(
  statementPath: NodePath<t.ExportNamedDeclaration>,
  components: Set<string>,
): boolean {
  const { node } = statementPath;
  if (node.declaration || node.source || node.specifiers.length === 0) return false;
  return node.specifiers.every(
    (specifier) =>
      t.isExportSpecifier(specifier) &&
      t.isIdentifier(specifier.local) &&
      components.has(specifier.local.name),
  );
}

function hasNonComponentExport(programPath: NodePath<t.Program>, components: Set<string>): boolean {
  for (const statementPath of programPath.get('body')) {
    if (!statementPath.isExportNamedDeclaration() && !statementPath.isExportDefaultDeclaration()) {
      continue;
    }
    if (isTypeOnlyExport(statementPath)) continue;
    if (
      statementPath.isExportNamedDeclaration() &&
      hasOnlyComponentSpecifiers(statementPath, components)
    ) {
      continue;
    }
    if (!isComponentDeclarationExport(statementPath)) return true;
  }
  return false;
}

function getMetadataTargets(
  statementPath: NodePath<t.Statement | t.ModuleDeclaration>,
  components: Set<string>,
): Array<{ name: string; functionPath: NodePath<AnyFunction> }> {
  const declarationPath = unwrapTopLevelDeclaration(statementPath);
  if (!declarationPath) return [];

  if (declarationPath.isFunctionDeclaration()) {
    const id = declarationPath.node.id;
    return id && components.has(id.name) ? [{ name: id.name, functionPath: declarationPath }] : [];
  }

  const targets: Array<{ name: string; functionPath: NodePath<AnyFunction> }> = [];
  for (const variablePath of declarationPath.get('declarations')) {
    const idPath = variablePath.get('id');
    const initPath = variablePath.get('init');
    if (
      idPath.isIdentifier() &&
      components.has(idPath.node.name) &&
      isFunctionLikeExpressionPath(initPath)
    ) {
      targets.push({ name: idPath.node.name, functionPath: initPath });
    }
  }
  return targets;
}

function createMetadataStatements(
  name: string,
  functionPath: NodePath<AnyFunction>,
  ctx: CompileContext,
  signatures: Map<string, string>,
): t.Statement[] {
  const fileName = getFileBasename(ctx);
  const signature =
    signatures.get(name) ?? componentSignature(functionBodyCode(functionPath) + fileName);
  const hmrId = `${simpleHash(fileName)}:${name}`;

  return [
    t.expressionStatement(
      t.assignmentExpression(
        '=',
        t.memberExpression(t.identifier(name), t.identifier('__signature')),
        t.stringLiteral(signature),
      ),
    ),
    t.expressionStatement(
      t.assignmentExpression(
        '=',
        t.memberExpression(t.identifier(name), t.identifier('__hmrId')),
        t.stringLiteral(hmrId),
      ),
    ),
  ];
}

function injectComponentMetadata(
  programPath: NodePath<t.Program>,
  ctx: CompileContext,
  components: Set<string>,
  signatures: Map<string, string>,
): void {
  if (components.size === 0) return;

  const nextBody: t.Statement[] = [];
  for (const statementPath of programPath.get('body')) {
    const statement = statementPath.node;
    nextBody.push(statement);
    for (const target of getMetadataTargets(statementPath, components)) {
      nextBody.push(...createMetadataStatements(target.name, target.functionPath, ctx, signatures));
    }
  }
  programPath.node.body = nextBody;
}

function isHmrComponentCall(value: t.Node | null | undefined): value is t.CallExpression {
  return (
    t.isCallExpression(value) &&
    t.isIdentifier(value.callee) &&
    value.callee.name === HMR_COMPONENT_NAME
  );
}

function canWrapArgument(value: t.CallExpression['arguments'][number] | undefined): boolean {
  return !!value && !t.isSpreadElement(value) && !t.isArgumentPlaceholder(value);
}

function getEssorHmrBindings(programPath: NodePath<t.Program>): HmrBindings {
  const bindings: HmrBindings = {
    createComponent: new Map(),
    mount: new Map(),
  };

  for (const statementPath of programPath.get('body')) {
    if (!statementPath.isImportDeclaration() || statementPath.node.source.value !== ESSOR_IMPORT) {
      continue;
    }
    for (const specifier of statementPath.node.specifiers) {
      if (!t.isImportSpecifier(specifier)) continue;
      const imported = specifier.imported;
      const importedName = t.isIdentifier(imported) ? imported.name : imported.value;
      if (!HMR_IMPORTS.has(importedName)) continue;

      const binding = statementPath.scope.getBinding(specifier.local.name);
      if (!binding) continue;
      const bucket = importedName === 'createComponent' ? bindings.createComponent : bindings.mount;
      bucket.set(specifier.local.name, binding);
    }
  }
  return bindings;
}

function hasImportBinding(path: NodePath, name: string, bindings: Map<string, Binding>): boolean {
  return bindings.has(name) && path.scope.getBinding(name) === bindings.get(name);
}

function generatedImportName(ctx: CompileContext, name: string): string | undefined {
  return ctx.imports.has(name) ? ctx.imports.get(name).name : undefined;
}

function isMountCallee(
  callPath: NodePath<t.CallExpression>,
  ctx: CompileContext,
  bindings: HmrBindings,
): boolean {
  const callee = callPath.node.callee;
  if (!t.isIdentifier(callee)) return false;
  if (hasImportBinding(callPath, callee.name, bindings.mount)) return true;
  return (
    callee.name === generatedImportName(ctx, 'createApp') ||
    callee.name === generatedImportName(ctx, 'hydrate')
  );
}

function isCreateComponentCallee(
  callPath: NodePath<t.CallExpression>,
  ctx: CompileContext,
  bindings: HmrBindings,
): boolean {
  const callee = callPath.node.callee;
  if (!t.isIdentifier(callee)) return false;
  return (
    hasImportBinding(callPath, callee.name, bindings.createComponent) ||
    callee.name === generatedImportName(ctx, 'createComponent')
  );
}

function createImportMetaHot(): t.MemberExpression {
  return t.memberExpression(
    t.metaProperty(t.identifier('import'), t.identifier('meta')),
    t.identifier('hot'),
  );
}

function createDisposeStatement(appId: t.Identifier): t.ExpressionStatement {
  const dispose = t.optionalMemberExpression(
    createImportMetaHot(),
    t.identifier('dispose'),
    false,
    true,
  );
  const unmount = t.optionalCallExpression(
    t.optionalMemberExpression(appId, t.identifier('unmount'), false, true),
    [],
    true,
  );
  return t.expressionStatement(
    t.optionalCallExpression(dispose, [t.arrowFunctionExpression([], unmount)], false),
  );
}

function wrapTopLevelMountDisposals(
  programPath: NodePath<t.Program>,
  ctx: CompileContext,
  bindings: HmrBindings,
): void {
  const nextBody: t.Statement[] = [];
  for (const statementPath of programPath.get('body')) {
    const expressionPath = statementPath.isExpressionStatement()
      ? statementPath.get('expression')
      : null;
    if (expressionPath?.isCallExpression() && isMountCallee(expressionPath, ctx, bindings)) {
      const appId = programPath.scope.generateUidIdentifier('app');
      nextBody.push(
        t.variableDeclaration('const', [t.variableDeclarator(appId, expressionPath.node)]),
      );
      nextBody.push(createDisposeStatement(appId));
    } else {
      nextBody.push(statementPath.node);
    }
  }
  programPath.node.body = nextBody;
}

/** Rewrites user-authored runtime calls. Generated JSX calls use the same name. */
function wrapComponentCreationCalls(
  programPath: NodePath<t.Program>,
  ctx: CompileContext,
  bindings: HmrBindings,
): void {
  programPath.traverse({
    CallExpression(callPath) {
      if (isCreateComponentCallee(callPath, ctx, bindings)) {
        const firstArg = callPath.node.arguments[0];
        if (canWrapArgument(firstArg)) callPath.node.callee = t.identifier(HMR_COMPONENT_NAME);
        return;
      }

      if (!isMountCallee(callPath, ctx, bindings)) return;
      const firstArg = callPath.node.arguments[0];
      if (!canWrapArgument(firstArg) || isHmrComponentCall(firstArg)) return;
      callPath.node.arguments[0] = t.callExpression(t.identifier(HMR_COMPONENT_NAME), [firstArg]);
    },
  });
}

/** Collects only top-level component declarations and their signatures. */
export function collectTopLevelHmrComponents(
  programPath: NodePath<t.Program>,
  ctx: CompileContext,
  hmrComponents?: Set<string>,
  hmrSignatures?: Map<string, string>,
): void {
  if (!isHmrEnabled(ctx)) return;
  const state = getHmrState(ctx, hmrComponents, hmrSignatures);

  for (const statementPath of programPath.get('body')) {
    collectFromStatement(
      statementPath as NodePath<t.Statement | t.ModuleDeclaration>,
      ctx,
      state.components,
      state.signatures,
    );
  }

  if (hasNonComponentExport(programPath, state.components)) {
    state.components.clear();
    state.signatures.clear();
  }
}

/** Applies metadata, call-site wrapping, root disposal, and the registry. */
export function applyHmr(
  programPath: NodePath<t.Program>,
  ctx: CompileContext,
  hmrComponents?: Set<string>,
  hmrSignatures?: Map<string, string>,
): void {
  if (!isHmrEnabled(ctx)) return;
  const state = getHmrState(ctx, hmrComponents, hmrSignatures);

  if (state.components.size > 0) {
    injectComponentMetadata(programPath, ctx, state.components, state.signatures);
  }

  const bindings = getEssorHmrBindings(programPath);
  wrapComponentCreationCalls(programPath, ctx, bindings);
  if (state.components.size === 0) return;

  wrapTopLevelMountDisposals(programPath, ctx, bindings);
  programPath.node.body.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(HMR_REGISTRY_NAME),
        t.arrayExpression([...state.components].map((name) => t.identifier(name))),
      ),
    ]),
  );
}

export function transformHMR(programPath: NodePath<t.Program>, ctx: CompileContext): void {
  if (!isHmrEnabled(ctx)) return;
  const state = getHmrState(ctx);
  collectTopLevelHmrComponents(programPath, ctx, state.components, state.signatures);
  applyHmr(programPath, ctx, state.components, state.signatures);
}
