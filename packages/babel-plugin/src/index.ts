import { compile } from './compile';
import { resolveOptions } from './options';
import type { PluginObj } from '@babel/core';

/**
 * Babel plugin for Essor framework.
 * Transforms Essor JSX and reactivity syntax into runtime calls.
 *
 * @returns {PluginObj} The Babel plugin object.
 */
export default function (): PluginObj {
  return {
    name: 'babel-plugin-essor',

    /**
     * Configures the parser options for the plugin.
     */
    manipulateOptions({ filename }, parserOpts) {
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
      /**
       * Compiles the current program with the resolved plugin options.
       */
      Program(path, state) {
        compile(path, resolveOptions(state.opts || {}, state.filename));
      },
    },
  };
}
