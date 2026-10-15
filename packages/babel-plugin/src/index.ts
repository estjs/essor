/**
 * Main Plugin Entry Point
 * Simplified babel plugin with clear pipeline
 */
import { createContext, emitArtifacts } from './context';
import { transformHMR, transformMapToFor, transformProps, transformSignals } from './transform';
import { parseJSX } from './parse';
import { analyzeIR } from './analyze';
import { generateCode } from './generate';
import type { PluginOptions } from './types';
import type * as t from '@babel/types';
import type { NodePath, PluginObject } from '@babel/core';

export default function essorBabelPlugin(): PluginObject {
  return {
    name: 'babel-plugin-essor',
    manipulateOptions({ filename }: any, parserOpts: any) {
      if (!parserOpts.plugins) {
        parserOpts.plugins = [];
      }
      if (!parserOpts.plugins.includes('jsx')) {
        parserOpts.plugins.push('jsx');
      }
      if (
        filename &&
        /\.[cm]?tsx?$/i.test(filename) &&
        !parserOpts.plugins.includes('typescript')
      ) {
        parserOpts.plugins.push('typescript');
      }
    },
    visitor: {
      Program: {
        enter(path: NodePath<t.Program>, state: any) {
          const filename = state.filename || 'unknown.tsx';
          const options: PluginOptions = state.opts || {};

          // Create compilation context
          const ctx = createContext(path, filename, options);
          state.essorContext = ctx;

          // Phase 1: Transform AST (signals, props, map-to-for, hmr)
          transformSignals(path, ctx);
          transformProps(path, ctx);
          transformMapToFor(path);
          transformHMR(path, ctx);
        },

        exit(path: NodePath<t.Program>, state: any) {
          const ctx = state.essorContext;
          if (!ctx) return;

          // Phase 4: Emit all artifacts (imports, templates, declarations, events)
          emitArtifacts(ctx);
        },
      },

      JSXElement(path: NodePath<t.JSXElement>, state: any) {
        const ctx = state.essorContext;
        if (!ctx) return;

        // Only process root JSX elements (not nested ones)
        if (path.parent.type === 'JSXElement' || path.parent.type === 'JSXFragment') return;

        // Phase 2: Parse JSX to IR
        const ir = parseJSX(path.node, ctx, false, path);
        analyzeIR(ir);

        // Phase 3: Generate code from IR
        const code = generateCode(ir, ctx);

        // Replace JSX with generated code
        path.replaceWith(code);
      },

      JSXFragment(path: NodePath<t.JSXFragment>, state: any) {
        const ctx = state.essorContext;
        if (!ctx) return;

        // Only process root fragments
        if (path.parent.type === 'JSXElement' || path.parent.type === 'JSXFragment') return;

        const ir = parseJSX(path.node, ctx, false, path);
        analyzeIR(ir);
        const code = generateCode(ir, ctx);
        path.replaceWith(code);
      },
    },
  };
}
