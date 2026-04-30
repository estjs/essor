import { types as t } from '@babel/core';
import { createCompileContext, createImport, setCompileContext, useImport } from './context';
import { applyHmr, collectTopLevelHmrComponents } from './plugins/hmr';
import { symbolVisitors } from './plugins/symbol';
import { propsVisitors } from './plugins/props';
import { compileJSXProgram } from './jsx';
import { RENDER_MODE } from './options';
import type { NodePath } from '@babel/core';
import type { PluginOptions } from './options';

/**
 * Runs the full Babel compile pipeline for a single program.
 *
 * @param path - The NodePath of the Program node.
 * @param options - The plugin options.
 * @returns {void}
 */
export function compile(path: NodePath<t.Program>, options: PluginOptions): void {
  try {
    // ── Pass 1: pre-analysis ─────────────────────────────────────────────────
    const ctx = createCompileContext(options, path);
    collectTopLevelHmrComponents(path, ctx);

    // ── Pass 2: props rewrite + signal transform (merged into one traversal) ──
    const activeVisitors = ctx.options.props
      ? { ...propsVisitors, ...symbolVisitors }
      : symbolVisitors;
    path.traverse(activeVisitors);

    // ── Pass 3: JSX → IR → generated code ────────────────────────────────────
    compileJSXProgram(path);
    // ── Post-process: HMR metadata + import injection ────────────────────────
    applyHmr(path, ctx);

    // emit delegateEvents([...]) call if any delegated events were collected
    if (ctx.profile !== RENDER_MODE.SERVER && ctx.delegateEvents.size > 0) {
      const delegateCallee = useImport('delegateEvents');
      const eventNames = Array.from(ctx.delegateEvents).map((name) => t.stringLiteral(name));
      path.node.body.push(
        t.expressionStatement(t.callExpression(delegateCallee, [t.arrayExpression(eventNames)])),
      );
    }

    createImport(path);
  } finally {
    // Reset so the next file's compile() starts with a clean slate.
    setCompileContext(null);
  }
}
