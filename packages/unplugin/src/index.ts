import { createUnplugin } from 'unplugin';
import * as babel from '@babel/core';
import essorBabelPlugin from 'babel-plugin-essor';
import { createFilter } from 'vite';
import type { UnpluginFactory } from 'unplugin';
import type { Options } from './types';

const CSS_EXTENSIONS = ['.css', '.scss', '.sass'];

const DEFAULT_OPTIONS = {
  symbol: '$',
  props: true,
  server: false,
};

export const unpluginFactory: UnpluginFactory<Options | undefined> = (options = {}) => {
  const filter = createFilter(options.include, options.exclude);

  return {
    name: 'unplugin-essor',
    // enforce: 'pre',
    config() {
      return {
        esbuild: {
          jsx: 'preserve',
        },
      };
    },

    transform(code, id) {
      if (['node_modules', 'dist', 'public'].some(p => id.includes(p))) {
        return;
      }
      //
      if (!filter(id) || !/.[cm]?[jt]sx?$/i.test(id)) {
        return null;
      }

      const result = babel.transformSync(code, {
        filename: id,
        sourceMaps: true,
        sourceType: 'module',
        plugins: [[essorBabelPlugin, { ...DEFAULT_OPTIONS, ...options }]],
      });
      if (result?.code) {
        return {
          code: result.code,
          map: result.map,
        };
      }
      return code;
    },
    handleHotUpdate(ctx: any) {
      for (const mod of ctx.modules) {
        const deps = mod.info?.meta?.deps;
        if (deps && deps.length > 0) {
          for (const dep of deps) {
            const mod = ctx.server.moduleGraph.getModuleById(dep);
            if (mod) {
              ctx.server.moduleGraph.invalidateModule(mod);
            }
          }
        } else if (
          mod.type === 'js' &&
          Array.from(mod.importers).every(
            (m: any) => m.type === 'css' || CSS_EXTENSIONS.some(ext => m.file?.endsWith(ext)),
          )
        ) {
          // invalidate all modules that import this module
          ctx.server.moduleGraph.invalidateAll();
        }
      }

      if (CSS_EXTENSIONS.some(ext => ctx.file.endsWith(ext))) {
        ctx.server.ws.send({
          type: 'full-reload',
        });
        return [];
      }
    },
  };
};

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory);

export default unplugin;
