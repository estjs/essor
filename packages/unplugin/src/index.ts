import { createUnplugin } from 'unplugin';
import * as babel from '@babel/core';
import essorBabelPlugin from 'babel-plugin-essor';
import { createFilter } from 'vite';
import type { UnpluginFactory } from 'unplugin';
import type { Options } from './types';
import type { ModuleNode, ViteDevServer } from 'vite';

const CSS_EXTENSIONS = ['.css', '.scss', '.sass'];
const JSX_EXTENSIONS = ['.jsx', '.tsx'];

const DEFAULT_OPTIONS = {
  symbol: '$',
  mode: 'client',
  props: true,
  hmr: true,
};
export const unpluginFactory: UnpluginFactory<Options | undefined> = (options: Options = {}) => {
  const filter = createFilter(options.include, options.exclude);

  return {
    name: 'unplugin-essor',
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

    handleHotUpdate(ctx: { file: string; modules: ModuleNode[]; server: ViteDevServer }) {
      const { file, modules, server } = ctx;

      // 1. Handle style file hot updates
      if (CSS_EXTENSIONS.some(ext => file.endsWith(ext))) {
        // Only update style modules, no need for full page refresh
        return modules;
      }

      // 2. Handle JSX/TSX component files
      if (JSX_EXTENSIONS.some(ext => file.endsWith(ext))) {
        const updatedModules = new Set<ModuleNode>();

        for (const mod of modules) {
          // Get module dependency information
          const deps = mod.info?.meta?.deps || [];
          const importers = Array.from(mod.importers || []);

          // Check if it's a component file
          const isComponent = JSX_EXTENSIONS.some(ext => mod.file?.endsWith(ext));

          if (isComponent) {
            // For component files, we only update the component itself and modules that directly depend on it
            updatedModules.add(mod);

            // Process direct dependencies
            for (const dep of deps) {
              const depMod = server.moduleGraph.getModuleById(dep);
              if (depMod) {
                updatedModules.add(depMod);
              }
            }

            // Process modules that import this component
            for (const importer of importers) {
              if ((importer as ModuleNode).type === 'js') {
                updatedModules.add(importer as ModuleNode);
              }
            }

            // Send HMR update event
            server.ws.send({
              type: 'custom',
              event: 'essor:hmr',
              data: {
                id: mod.id,
                timestamp: Date.now(),
              },
            });
          } else {
            // For non-component files, we need to update all modules that depend on it
            updatedModules.add(mod);
            server.moduleGraph.invalidateModule(mod);

            // Recursively process all dependencies
            const stack = [...importers];
            while (stack.length) {
              const current = stack.pop() as ModuleNode;
              if (current && !updatedModules.has(current)) {
                updatedModules.add(current);
                stack.push(...Array.from(current.importers || []));
              }
            }
          }
        }

        return Array.from(updatedModules);
      }

      // 3. Other file types, maintain default behavior
      return modules;
    },
  };
};

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory);

export default unplugin;
