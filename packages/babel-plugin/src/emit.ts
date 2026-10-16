/**
 * Emit artifacts - imports, templates, declarations, delegated events
 */
import * as t from '@babel/types';
import { startsWith } from '@estjs/shared';
import type { CompileContext } from './types';

/** Runtime helpers that live in `essor/server` (server mode only). */
const SERVER_NAMES = new Set([
  'ssr',
  'ssrSpread',
  'ssrAttr',
  'ssrAttrDynamic',
  'ssrBind',
  'ssrClass',
  'ssrStyle',
  'ssrSelected',
  'ssrTextValue',
  'ssrTextContentValue',
  'ssrTextContent',
  'resolve',
  'unsafeHTML',
  'ssrComponent',
  'For',
  'ErrorBoundary',
  'Fragment',
  'Portal',
  'Suspense',
  'Transition',
  'getHydrationKey',
  'resetHydrationKey',
  'escape',
]);

export function emitArtifacts(ctx: CompileContext): void {
  emitImports(ctx);
  emitTemplates(ctx);
  emitDeclarations(ctx);
  if (ctx.mode === 'client' || ctx.mode === 'hydrate') {
    emitDelegateEvents(ctx);
  }
}

function findFirstNonImportIndex(body: t.Statement[]): number {
  for (const [i, element] of body.entries()) {
    if (!t.isImportDeclaration(element)) {
      return i;
    }
  }
  return 0;
}

function emitImports(ctx: CompileContext): void {
  const imports = ctx.imports.getAll();
  if (imports.size === 0) return;

  const clientSpecifiers: t.ImportSpecifier[] = [];
  const serverSpecifiers: t.ImportSpecifier[] = [];

  if (ctx.mode === 'server') {
    for (const [name, id] of imports.entries()) {
      const spec = t.importSpecifier(id, t.identifier(name));
      if (SERVER_NAMES.has(name)) {
        serverSpecifiers.push(spec);
      } else {
        clientSpecifiers.push(spec);
      }
    }
  } else {
    for (const [name, id] of imports.entries()) {
      const spec = t.importSpecifier(id, t.identifier(name));
      clientSpecifiers.push(spec);
    }
  }

  const importDecls: t.ImportDeclaration[] = [];
  if (clientSpecifiers.length > 0) {
    importDecls.push(t.importDeclaration(clientSpecifiers, t.stringLiteral('essor')));
  }
  if (serverSpecifiers.length > 0) {
    importDecls.push(t.importDeclaration(serverSpecifiers, t.stringLiteral('essor/server')));
  }

  for (let i = importDecls.length - 1; i >= 0; i--) {
    ctx.programPath.node.body.unshift(importDecls[i]);
  }
}

function emitTemplates(ctx: CompileContext): void {
  const templates = ctx.templates.getAll();
  const declarations: t.VariableDeclaration[] = [];

  if (templates.length > 0) {
    const templateFn =
      ctx.mode === 'hydrate' && ctx.imports.has('getRenderedElement')
        ? ctx.imports.get('getRenderedElement')
        : ctx.imports.get('template');

    declarations.push(
      ...templates.map(({ id, html, svg }) => {
        const args: t.Expression[] = [t.stringLiteral(html)];
        if (svg) args.push(t.booleanLiteral(true));

        const callExpr = t.callExpression(templateFn, args);
        t.addComment(callExpr, 'leading', '#__PURE__', false);

        return t.variableDeclaration('const', [t.variableDeclarator(id, callExpr)]);
      }),
    );
  }

  if (ctx.mode === 'server') {
    const templateArrays = ctx.templates.getAllArrays();
    declarations.push(
      ...templateArrays.map(({ id, parts }) => {
        const arrayLiteral = t.arrayExpression(parts.map((part) => t.stringLiteral(part)));
        t.addComment(arrayLiteral, 'leading', '#__PURE__', false);
        return t.variableDeclaration('const', [
          t.variableDeclarator(t.identifier(id), arrayLiteral),
        ]);
      }),
    );
  }

  if (declarations.length === 0) return;

  const body = ctx.programPath.node.body;
  body.splice(findFirstNonImportIndex(body), 0, ...declarations);
}

function emitDeclarations(ctx: CompileContext): void {
  const declarations = ctx.declarations.getAll();
  if (declarations.length === 0) return;

  const body = ctx.programPath.node.body;
  let insertIndex = findFirstNonImportIndex(body);
  while (insertIndex < body.length && t.isVariableDeclaration(body[insertIndex])) {
    const decl = body[insertIndex];
    const init = decl.declarations[0]?.init;
    if (t.isCallExpression(init) && t.isIdentifier(init.callee)) {
      const calleeName = init.callee.name;
      if (
        startsWith(calleeName, '_template$') ||
        startsWith(calleeName, '_claimElement') ||
        startsWith(calleeName, '_getRenderedElement$')
      ) {
        insertIndex++;
        continue;
      }
    }
    break;
  }
  body.splice(insertIndex, 0, ...declarations);
}

function emitDelegateEvents(ctx: CompileContext): void {
  if (!ctx.delegatedEvents || ctx.delegatedEvents.size === 0) return;

  const delegateFn = ctx.imports.get('delegateEvents');
  const eventTypes = Array.from(ctx.delegatedEvents).sort();

  const callExpr = t.expressionStatement(
    t.callExpression(delegateFn, [
      t.arrayExpression(eventTypes.map((type) => t.stringLiteral(type))),
    ]),
  );

  ctx.programPath.node.body.push(callExpr);
}
