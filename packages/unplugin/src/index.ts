import { createUnplugin } from 'unplugin';
import * as babel from '@babel/core';
import essorBabelPlugin from '@estjs/babel-plugin';
import { createFilter } from 'vite';
import type { UnpluginFactory } from 'unplugin';
import type { Options } from './types';
import type { ModuleNode, ViteDevServer } from 'vite';

const CSS_EXTENSIONS = ['.css', '.scss', '.sass'];
const JSX_EXTENSIONS = ['.jsx', '.tsx'];

const DEFAULT_OPTIONS = {
  symbol: '$',
  mode: 'client',
  autoProps: true,
  hmr: true,
};
export const unpluginFactory: UnpluginFactory<Options | undefined> = (options: Options = {}) => {
  const filter = createFilter(options.include, options.exclude);

  return {
    name: '@estjs/unplugin',
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

      // 1. 处理样式文件的热更新
      if (CSS_EXTENSIONS.some(ext => file.endsWith(ext))) {
        // 只更新样式模块，不需要全页面刷新
        return modules;
      }

      // 2. 处理 JSX/TSX 组件文件
      if (JSX_EXTENSIONS.some(ext => file.endsWith(ext))) {
        const updatedModules = new Set<ModuleNode>();

        for (const mod of modules) {
          // 获取模块的依赖信息
          const deps = mod.info?.meta?.deps || [];
          const importers = Array.from(mod.importers || []);

          // 检查是否是组件文件
          const isComponent = JSX_EXTENSIONS.some(ext => mod.file?.endsWith(ext));

          if (isComponent) {
            // 对于组件文件，我们只更新组件本身和直接依赖它的模块
            updatedModules.add(mod);

            // 处理直接依赖
            for (const dep of deps) {
              const depMod = server.moduleGraph.getModuleById(dep);
              if (depMod) {
                updatedModules.add(depMod);
              }
            }

            // 处理导入该组件的模块
            for (const importer of importers) {
              if ((importer as ModuleNode).type === 'js') {
                updatedModules.add(importer as ModuleNode);
              }
            }

            // 发送 HMR 更新事件
            server.ws.send({
              type: 'custom',
              event: 'essor:hmr',
              data: {
                id: mod.id,
                timestamp: Date.now(),
              },
            });
          } else {
            // 对于非组件文件，我们需要更新所有依赖它的模块
            updatedModules.add(mod);
            server.moduleGraph.invalidateModule(mod);

            // 递归处理所有依赖
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

      // 3. 其他文件类型，保持默认行为
      return modules;
    },
  };
};

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory);

export default unplugin;
