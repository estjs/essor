import type { FilterPattern } from 'vite';

/**
 * Canonical render modes, kept in sync with `babel-plugin-essor`'s
 * `RENDER_MODE` enum (`client` | `server` | `hydrate`).
 */
export type RenderMode = 'client' | 'server' | 'hydrate';

/**
 * Legacy render-mode aliases retained for backwards compatibility.
 *
 * @deprecated Use the canonical {@link RenderMode} names instead — `ssg` maps
 * to `server` and `ssr` maps to `hydrate`. These aliases will be removed in a future major.
 */
export type LegacyRenderMode = 'ssg' | 'ssr';

export interface Options {
  /**
   * Minimatch patterns to include for transformation.
   */
  include?: FilterPattern;

  /**
   * Minimatch patterns to exclude from transformation.
   */
  exclude?: FilterPattern;

  /**
   * Render target used by the compiler. Accepts the canonical
   * {@link RenderMode} names (`client` | `server` | `hydrate`).
   *
   * The legacy `ssg` / `ssr` aliases are still accepted but deprecated; `ssg`
   * resolves to `server` and `ssr` resolves to `hydrate`.
   */
  mode?: RenderMode | LegacyRenderMode;

  /**
   * Whether to transform component props preprocessing.
   * @default true
   */
  props?: boolean;

  /**
   * Prefix symbol used to identify reactive variables.
   * @deprecated Use `signalPrefix` instead.
   * @default '$'
   */
  symbol?: '$';

  /**
   * Custom signal prefix identifier (e.g. '$').
   * @default '$'
   */
  signalPrefix?: string;

  /**
   * Whether to enable hot module replacement.
   * @default true
   */
  hmr?: boolean;

  /**
   * Whether to omit closing tags from native DOM templates
   * @default true
   */
  omitClosingTags?: boolean;

  /**
   * Whether to enable legacy For compiler optimization.
   * @default false
   */
  enableFor?: boolean;

  /**
   * Forces event delegation on or off globally.
   * @default true
   */
  delegateEvents?: boolean;
}
