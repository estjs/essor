import { createUnplugin } from 'unplugin';
import * as babel from '@babel/core';
import essorBabelPlugin from 'babel-plugin-essor';
import { createFilter } from 'vite';
// @ts-ignore - resolved by esbuild raw plugin at build time
import hmrRuntimeCode from './hmr-runtime.js?raw';
import type { UnpluginContextMeta, UnpluginFactory } from 'unplugin';
import type { Options } from './types';

/**
 * Virtual module ID for HMR runtime
 * Injected as an import in transformed files that have HMR components
 */
const VIRTUAL_MODULE_ID = 'virtual:essor-hmr';
const RESOLVED_VIRTUAL_MODULE_ID = '\0virtual:essor-hmr';

/**
 * Default plugin options
 */
const DEFAULT_OPTIONS = {
  symbol: '$',
  mode: 'client',
  props: true,
  hmr: true,
  enableFor: false,
  omitClosingTags: true,
};

/**
 * Performance: Pre-compiled regex and constants
 */
const FILE_EXTENSION_REGEX = /\.[cm]?[jt]sx?$/i;
const SKIP_DIRECTORIES = ['node_modules', 'dist', 'public'];
const HMR_DISPOSE_PREFIX = 'import.meta.hot?.dispose(';
const HMR_DISPOSE_SUFFIX = ');';

type BundlerType = 'vite' | 'webpack5' | 'rspack' | 'rollup' | 'esbuild' | 'standard';

/**
 * Detect bundler type from unplugin meta or environment variables
 *
 * This is important for HMR because different bundlers have different
 * HMR APIs (import.meta.hot.accept, module.hot.accept, etc.)
 */
function detectBundler(meta: UnpluginContextMeta): BundlerType {
  // First, try to detect from unplugin meta
  if (meta?.framework) {
    switch (meta.framework) {
      case 'vite':
        return 'vite';
      case 'webpack':
        return 'webpack5';
      case 'rspack':
        return 'rspack';
      case 'rollup':
        return 'rollup';
      case 'esbuild':
        return 'esbuild';
    }
  }

  // Fallback: detect from environment variables
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.VITE || process.env.VITEST) return 'vite';
    if (process.env.WEBPACK_VERSION) return 'webpack5';
    if (process.env.RSPACK) return 'rspack';
  }

  // Default to standard if detection fails
  return 'standard';
}

/**
 * Generate HMR boilerplate code for a specific bundler
 *
 * @param bundlerType - The bundler type detected
 * @returns Object with imports and registration code
 */
function extractHMRDisposeHandlers(code: string) {
  const lines = code.split('\n');
  const disposeHandlers: string[] = [];
  const cleanedLines = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith(HMR_DISPOSE_PREFIX) || !trimmed.endsWith(HMR_DISPOSE_SUFFIX)) {
      return true;
    }

    disposeHandlers.push(trimmed.slice(HMR_DISPOSE_PREFIX.length, -HMR_DISPOSE_SUFFIX.length));
    return false;
  });

  return {
    code: cleanedLines.join('\n'),
    disposeHandlers,
  };
}

function generateHMRCode(bundlerType: BundlerType, disposeHandlers: string[] = []) {
  // Import HMR utilities from virtual module
  const imports = {
    createHMRComponent: `import { createHMRComponent as __$createHMRComponent$__ } from "${VIRTUAL_MODULE_ID}";`,
    hmrAccept: `import { hmrAccept as __$hmrAccept$__ } from "${VIRTUAL_MODULE_ID}";`,
  };
  const disposeLines = disposeHandlers.map((handler) => `  import.meta.hot.dispose(${handler});`);

  const register =
    bundlerType === 'vite'
      ? [
          'if (import.meta.hot) {',
          ...disposeLines,
          '  import.meta.hot.accept();',
          '  __$hmrAccept$__("vite", import.meta.hot, __$registry$__);',
          '}',
        ].join('\n')
      : [
          'if (import.meta.hot) {',
          ...disposeLines,
          `  __$hmrAccept$__("${bundlerType}", import.meta.hot, __$registry$__);`,
          '}',
        ].join('\n');

  return {
    imports,
    register,
  };
}

export const unpluginFactory: UnpluginFactory<Options | undefined> = (
  options: Options = {},
  meta,
) => {
  // Create file filter based on include/exclude patterns
  const filter = createFilter(options.include, options.exclude);

  // Detect bundler type for HMR
  const bundlerType = detectBundler(meta);

  // NODE_ENV is set by most bundlers; fallback treats unknown env as dev (HMR on)
  let isProd = process.env.NODE_ENV === 'production';

  // Merge user options with defaults (hmr excluded — computed dynamically in transform)
  const finalOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
    bundler: bundlerType,
  };

  return {
    name: 'unplugin-essor',
    /**
     * Vite-specific config to preserve JSX so the babel plugin can handle it.
     
     */
    vite: {
      config(this: unknown) {
        // Inside a vite hook, `this` is the rollup plugin context. On Vite 8 /
        // rolldown-vite it exposes `meta.rolldownVersion`.
        const ctx = this as { meta?: Record<string, unknown> } | undefined;
        const isRolldownVite = !!ctx?.meta && 'rolldownVersion' in ctx.meta;
        const key = (isRolldownVite ? 'oxc' : 'esbuild') as 'esbuild';
        return {
          [key]: { jsx: 'preserve' },
        };
      },
      configResolved(config: { command: string }) {
        // Vite's command is more reliable than NODE_ENV for detecting dev vs build
        isProd = config.command === 'build';
      },
    },

    /**
     * Resolve virtual HMR runtime module
     */
    resolveId(id: string) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID;
      }
      return null;
    },

    /**
     * Load virtual HMR runtime module
     */
    load(id: string) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        return {
          code: hmrRuntimeCode,
          map: null,
        };
      }
      return null;
    },
    rolldown: {
      options(opts) {
        opts.transform ??= {
          jsx: 'preserve',
        };
      },
    },
    /**
     * Transform code with Babel plugin
     */
    transform(code, id) {
      // Skip node_modules, dist, and public directories
      if (SKIP_DIRECTORIES.some((p) => id.includes(p))) {
        return;
      }

      // Only transform JS/TS files
      if (!filter(id) || !FILE_EXTENSION_REGEX.test(id)) {
        return null;
      }

      // options.hmr explicit value wins; otherwise enable only in dev
      const babelOptions = { ...finalOptions, hmr: !isProd && finalOptions.hmr };

      // Transform with Babel (with error handling)
      let result;
      try {
        result = babel.transformSync(code, {
          filename: id,
          sourceMaps: true,
          sourceType: 'module',
          plugins: [[essorBabelPlugin, babelOptions]],
        });
      } catch (error) {
        console.error(`[unplugin-essor] Transform failed for ${id}:`, error);
        return null;
      }

      if (!result?.code) {
        return code;
      }

      let finalCode = '';

      // Inject HMR code if enabled and components are present
      if (babelOptions.hmr) {
        const hmrResult = extractHMRDisposeHandlers(result.code);
        const hmrCode = generateHMRCode(bundlerType, hmrResult.disposeHandlers);
        const transformedCode = hmrResult.code;

        if (transformedCode.includes('__$createHMRComponent$__')) {
          finalCode = `${hmrCode.imports.createHMRComponent}\n${finalCode}`;
        }
        finalCode += transformedCode;
        if (transformedCode.includes('__$registry$__')) {
          finalCode = `${hmrCode.imports.hmrAccept}\n${finalCode}\n${hmrCode.register}`;
        }
      } else {
        finalCode += result.code;
      }

      return {
        code: finalCode,
        map: result.map,
      };
    },
  };
};

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory);

export default unplugin;
