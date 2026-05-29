import { generate } from '@babel/generator';
import { type NodePath, types as t } from '@babel/core';
import { type AnyFunction, isFunctionLikeExpressionPath } from '../ast-utils';
import { checkHasJSXReturn } from '../ast-utils';
import type { CompileContext } from '../context';

const HMR_COMPONENT_NAME = '__$createHMRComponent$__';
const WHITESPACE_REGEX = /\s+/g;
const PATH_SEPARATOR_REGEX = /[/\\]/;

/** Returns the basename of the current file, used for stable cross-machine HMR hashes. */
function getFileBasename(ctx: CompileContext): string {
  const filename = ctx.options.filename!;
  const segments = filename.split(PATH_SEPARATOR_REGEX);
  return segments[segments.length - 1] || filename;
}

/**
 * Computes a compact stable hash for HMR metadata.
 */
function simpleHash(value: string): string {
  let hash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }

  return (hash >>> 0).toString(36);
}

/**
 * Generates component signature.
 */
function generateComponentSignature(code: string): string {
  return simpleHash(code.replaceAll(WHITESPACE_REGEX, ' ').trim());
}

/**
 * Returns function body code.
 */
function getFunctionBodyCode(path: NodePath<AnyFunction>): string {
  return generate(path.node.body).code;
}

/**
 * Unwraps top level declaration.
 */
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

/**
 * Collects HMR-eligible component names from a top-level statement.
 */
function collectFromStatement(
  statementPath: NodePath<t.Statement | t.ModuleDeclaration>,
  ctx: CompileContext,
): void {
  const declarationPath = unwrapTopLevelDeclaration(statementPath);

  if (!declarationPath) {
    return;
  }

  if (declarationPath.isFunctionDeclaration()) {
    const id = declarationPath.node.id;
    if (id && checkHasJSXReturn(declarationPath)) {
      const name = id.name;
      ctx.hmrComponents.add(name);
      ctx.hmrSignatures.set(
        name,
        generateComponentSignature(getFunctionBodyCode(declarationPath) + getFileBasename(ctx)),
      );
    }
    return;
  }

  for (const variablePath of declarationPath.get('declarations')) {
    const idPath = variablePath.get('id');
    const initPath = variablePath.get('init');

    if (!idPath.isIdentifier()) {
      continue;
    }

    if (!isFunctionLikeExpressionPath(initPath)) {
      continue;
    }

    if (checkHasJSXReturn(initPath)) {
      const name = idPath.node.name;
      ctx.hmrComponents.add(name);
      ctx.hmrSignatures.set(
        name,
        generateComponentSignature(getFunctionBodyCode(initPath) + getFileBasename(ctx)),
      );
    }
  }
}

/**
 * Returns component declarations that should receive HMR metadata.
 */
function getMetadataTargets(
  statementPath: NodePath<t.Statement | t.ModuleDeclaration>,
  ctx: CompileContext,
): Array<{
  name: string;
  functionPath: NodePath<AnyFunction>;
}> {
  const declarationPath = unwrapTopLevelDeclaration(statementPath);

  if (!declarationPath) {
    return [];
  }

  if (declarationPath.isFunctionDeclaration()) {
    const id = declarationPath.node.id;
    if (id && ctx.hmrComponents.has(id.name)) {
      return [{ name: id.name, functionPath: declarationPath }];
    }

    return [];
  }

  const targets: Array<{
    name: string;
    functionPath: NodePath<AnyFunction>;
  }> = [];

  for (const variablePath of declarationPath.get('declarations')) {
    const idPath = variablePath.get('id');
    const initPath = variablePath.get('init');

    if (!idPath.isIdentifier()) {
      continue;
    }

    if (!ctx.hmrComponents.has(idPath.node.name)) {
      continue;
    }

    if (isFunctionLikeExpressionPath(initPath)) {
      targets.push({
        name: idPath.node.name,
        functionPath: initPath,
      });
    }
  }

  return targets;
}

/**
 * Creates `__signature` and `__hmrId` assignments for a component.
 */
function createMetadataStatements(
  name: string,
  functionPath: NodePath<t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression>,
  ctx: CompileContext,
): t.Statement[] {
  const fileName = getFileBasename(ctx);
  const fileHash = simpleHash(fileName);
  const signature =
    ctx.hmrSignatures.get(name) ??
    generateComponentSignature(getFunctionBodyCode(functionPath) + fileName);

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
        t.stringLiteral(`${fileHash}:${name}`),
      ),
    ),
  ];
}

/**
 * Injects component metadata.
 */
function injectComponentMetadata(programPath: NodePath<t.Program>, ctx: CompileContext): void {
  if (ctx.hmrComponents.size === 0) {
    return;
  }

  const nextBody: t.Statement[] = [];

  for (const statementPath of programPath.get('body')) {
    nextBody.push(statementPath.node);

    for (const target of getMetadataTargets(statementPath, ctx)) {
      nextBody.push(...createMetadataStatements(target.name, target.functionPath, ctx));
    }
  }

  programPath.node.body = nextBody;
}

function isCreateHMRComponentCall(value: t.Node | null | undefined): value is t.CallExpression {
  return (
    t.isCallExpression(value) &&
    t.isIdentifier(value.callee) &&
    value.callee.name === HMR_COMPONENT_NAME
  );
}

function canWrapArgument(value: t.CallExpression['arguments'][number] | undefined): boolean {
  return !!value && !t.isSpreadElement(value) && !t.isArgumentPlaceholder(value);
}

/**
 * Rewrites component creation calls to their HMR-aware variants.
 *
 * This intentionally wraps imported components too. Metadata is still only
 * emitted for top-level components in the current file, but imported component
 * functions already carry their own metadata after their module is transformed.
 */
function wrapComponentCreationCalls(programPath: NodePath<t.Program>, ctx: CompileContext): void {
  programPath.traverse({
    /**
     * Rewrites `createComponent` and `createApp` calls for HMR tracking.
     */
    CallExpression(callPath) {
      const { callee } = callPath.node;

      if (!t.isIdentifier(callee)) return;

      if (callee.name === ctx.importIdentifiers.createComponent.name) {
        const firstArg = callPath.node.arguments[0];
        if (canWrapArgument(firstArg)) {
          callPath.node.callee = t.identifier(HMR_COMPONENT_NAME);
        }
        return;
      }

      // Transform: createApp(App, 'root') -> createApp(__$createHMRComponent$__(App), 'root')
      if (callee.name === 'createApp') {
        const args = callPath.node.arguments;
        if (args.length === 0) return;

        // Skip if already transformed
        if (isCreateHMRComponentCall(args[0])) {
          return;
        }

        if (!canWrapArgument(args[0])) return;

        args[0] = t.callExpression(t.identifier(HMR_COMPONENT_NAME), [args[0]]);
        callPath.node.arguments = args;
      }
    },
  });
}

/**
 * Collects top level HMR components.
 */
export function collectTopLevelHmrComponents(
  programPath: NodePath<t.Program>,
  ctx: CompileContext,
): void {
  if (!ctx.options.hmr || !ctx.options.bundler) {
    return;
  }

  for (const statementPath of programPath.get('body')) {
    collectFromStatement(statementPath as NodePath<t.Statement | t.ModuleDeclaration>, ctx);
  }
}

/**
 * Applies HMR metadata injection and runtime wrapping to the program.
 */
export function applyHmr(programPath: NodePath<t.Program>, ctx: CompileContext): void {
  if (!ctx.options.hmr || !ctx.options.bundler) {
    return;
  }

  if (ctx.hmrComponents.size > 0) {
    injectComponentMetadata(programPath, ctx);
  }

  wrapComponentCreationCalls(programPath, ctx);

  if (ctx.hmrComponents.size === 0) {
    return;
  }

  programPath.node.body.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier('__$registry$__'),
        t.arrayExpression([...ctx.hmrComponents].map((name) => t.identifier(name))),
      ),
    ]),
  );
}
