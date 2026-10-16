import { createUnplugin } from 'unplugin';
import * as babel from '@babel/core';
import essorBabelPlugin from 'babel-plugin-essor';
import { createFilter } from 'vite';
// @ts-ignore - resolved by esbuild raw plugin at build time
import hmrRuntimeCode from './hmrRuntime.js?raw';
import type { UnpluginContextMeta, UnpluginFactory } from 'unplugin';
import type { LegacyRenderMode, Options, RenderMode } from './types';

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
  symbol: '$' as const,
  mode: 'client' as RenderMode,
  props: true,
  hmr: true,
  omitClosingTags: true,
  delegateEvents: true,
};

/**
 * Maps the deprecated `ssg` / `ssr` mode aliases onto the canonical render
 * modes understood by `babel-plugin-essor`:
 *   - `ssg` → `server`  (emit static HTML strings via `renderToString`)
 *   - `ssr` → `hydrate` (emit hydration-ready client output)
 *
 * Retained only for backwards compatibility; the aliases will be removed in a
 * future major release (see {@link LegacyRenderMode}). Use the canonical
 * `client` | `server` | `hydrate` names instead.
 */
const LEGACY_MODE_ALIASES: Record<string, RenderMode> = {
  ssg: 'server',
  ssr: 'hydrate',
};

/**
 * Normalizes a user-supplied `mode` to a canonical {@link RenderMode}. Accepts
 * the canonical names verbatim and translates the deprecated `ssg` / `ssr`
 * aliases so the rest of the plugin and the Babel plugin only ever see
 * `client` | `server` | `hydrate`.
 */
function normalizeMode(mode: RenderMode | LegacyRenderMode | undefined): RenderMode {
  if (mode) {
    return LEGACY_MODE_ALIASES[mode] || (mode as RenderMode);
  }
  return 'client';
}

/**
 * Performance: Pre-compiled regex and constants
 */
const FILE_EXTENSION_REGEX = /\.[cm]?[jt]sx?$/i;
const SKIP_DIRECTORIES_REGEX = /[\\/](?:node_modules|dist|public)[\\/]/;
const HMR_DISPOSE_PREFIX = 'import.meta.hot?.dispose(';
const HMR_DISPOSE_SUFFIX = ');';

const HMR_IMPORTS = {
  createHMRComponent: `import { createHMRComponent as __$createHMRComponent$__ } from "${VIRTUAL_MODULE_ID}";`,
  hmrAccept: `import { hmrAccept as __$hmrAccept$__ } from "${VIRTUAL_MODULE_ID}";`,
} as const;

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

  // Defensive fallback: unplugin always provides meta.framework, but in edge
  // cases (custom wrappers, test harnesses) these env vars act as a safety net.
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.VITE || process.env.VITEST) return 'vite';
    if (process.env.WEBPACK_VERSION) return 'webpack5';
    if (process.env.RSPACK) return 'rspack';
  }

  return 'standard';
}

/**
 * Extract mount cleanup handlers emitted by the Babel HMR pass.
 *
 * @param code - Transformed module code.
 * @returns Module code without inline disposal calls and the extracted handlers.
 */
function extractHMRDisposeHandlers(code: string) {
  if (!code.includes(HMR_DISPOSE_PREFIX)) {
    return { code, disposeHandlers: [] };
  }
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

/**
 * Returns the correct hot-module-replacement global expression for a bundler.
 *
 * - Vite:             `import.meta.hot`
 * - webpack / rspack: `import.meta.webpackHot`  (webpack-compatible HMR protocol)
 * - others:           `import.meta.hot`          (no real HMR; guard is always falsy — safe)
 */
function getHotExpression(bundlerType: BundlerType): string {
  if (bundlerType === 'webpack5' || bundlerType === 'rspack') {
    return 'import.meta.webpackHot';
  }
  return 'import.meta.hot';
}

function generateHMRCode(bundlerType: BundlerType, disposeHandlers: string[] = []) {
  const hot = getHotExpression(bundlerType);
  const disposeLines = disposeHandlers.map((handler) => `  ${hot}.dispose(${handler});`);

  // Build the HMR registration block. Vite needs an explicit `accept()` call;
  // webpack/rspack handle acceptance inside `__$hmrAccept$__`.
  const lines = [`if (${hot}) {`, ...disposeLines];
  if (bundlerType === 'vite') {
    lines.push(`  ${hot}.accept();`);
  }
  lines.push(`  __$hmrAccept$__("${bundlerType}", ${hot}, __$registry$__);`, '}');

  return { imports: HMR_IMPORTS, register: lines.join('\n') };
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

  // Merge user options with defaults (hmr excluded — computed dynamically in
  // transform). `mode` is normalized to a canonical RenderMode so the Babel
  // plugin only ever receives `client` | `server` | `hydrate`.
  const finalOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
    mode: normalizeMode(options.mode ?? DEFAULT_OPTIONS.mode),
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
    transform(code, id, options?: { ssr?: boolean }) {
      // Skip node_modules, dist, public and non-JS/TS files
      if (SKIP_DIRECTORIES_REGEX.test(id) || !FILE_EXTENSION_REGEX.test(id) || !filter(id)) {
        return;
      }
      const isSsr = finalOptions.mode === 'server' || options?.ssr === true;

      // Extract unplugin-only options before passing to Babel
      const { symbol, ...restOptions } = finalOptions;
      delete (restOptions as { include?: unknown }).include;
      delete (restOptions as { exclude?: unknown }).exclude;
      const babelPassOptions = restOptions;

      const babelOptions = {
        ...babelPassOptions,
        signalPrefix: finalOptions.signalPrefix ?? symbol ?? '$',
        mode: isSsr ? 'server' : finalOptions.mode,
        hmr: !isSsr && !isProd && finalOptions.hmr,
      };

      // Transform with Babel (with error handling)
      let result;
      try {
        result = babel.transformSync(code, {
          filename: id,
          sourceMaps: true,
          sourceType: 'module',
          configFile: false,
          babelrc: false,
          parserOpts: {
            plugins: ['jsx', 'typescript'],
          },
          plugins: [[essorBabelPlugin as any, babelOptions]],
        });
      } catch (error) {
        console.error(`[unplugin-essor] Transform failed for ${id}:`, error);
        return null;
      }

      if (!result?.code) {
        return code;
      }

      let finalCode: string;

      if (babelOptions.hmr) {
        const { code: strippedCode, disposeHandlers } = extractHMRDisposeHandlers(result.code);
        const hasComponents = strippedCode.includes('__$createHMRComponent$__');
        const hasRegistry = strippedCode.includes('__$registry$__');

        if (!hasComponents && !hasRegistry && disposeHandlers.length === 0) {
          finalCode = result.code;
        } else {
          const hmrCode = generateHMRCode(bundlerType, disposeHandlers);
          const topParts: string[] = [];
          if (hasRegistry) topParts.push(hmrCode.imports.hmrAccept);
          if (hasComponents) topParts.push(hmrCode.imports.createHMRComponent);
          const prependedText = topParts.length > 0 ? `${topParts.join('\n')}\n` : '';
          const bottomParts: string[] = [];
          if (hasRegistry) bottomParts.push(hmrCode.register);
          const appendedText = bottomParts.length > 0 ? `\n${bottomParts.join('\n')}` : '';

          finalCode = `${prependedText}${strippedCode}${appendedText}`;

          if (result.map && prependedText) {
            const prependedLines = prependedText.split('\n').length - 1;
            result.map = {
              ...result.map,
              mappings: `${';'.repeat(prependedLines)}${result.map.mappings || ''}`,
            };
          }
        }
      } else {
        finalCode = result.code;
      }

      return {
        code: finalCode,
        map: result.map,
        // Vite uses this meta to differentiate cache entries.
        // Without it, SSR and client transforms share the same cache,
        // causing SSR to receive client code (with JSX syntax).
        meta: {
          ssr: isSsr,
        },
      };
    },
  };
};

/**
 * Unplugin integration for Essor, supporting Vite, Webpack, Rspack, Rollup, and esbuild.
 */
export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory);

export default unplugin;
