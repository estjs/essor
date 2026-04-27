/** Supported render targets for the compiler. */
export enum RENDER_MODE {
  CLIENT = 'client',
  SERVER = 'server',
  HYDRATE = 'hydrate',
}

/** Union of all valid render mode strings — derived from the enum to stay in sync automatically. */
export type RenderMode = `${RENDER_MODE}`;

export interface PluginOptions {
  /**
   * Render target used by the code transform.
   * @default 'client'
   */
  mode?: RenderMode;

  /**
   * Enables hot module replacement mode.
   * @default false
   */
  hmr?: boolean;

  /**
   * Enables component props preprocessing.
   * @default true
   */
  props?: boolean;

  /**
   * Filename used for internal tracking and diagnostics.
   */
  filename?: string;

  /**
   * Prefix used for reactive signals. Defaults to `$`.
   */
  signalPrefix?: string;

  /**
   * Forces event delegation on or off globally. When `false`, the compiler
   * always emits real `addEventListener` bindings.
   * By default, delegation is inferred from `isDelegatedEvent`.
   */
  delegateEvents?: boolean;

  /**
   * Omits trailing closing tags in templates to reduce output size.
   * @default false
   */
  omitClosingTags?: boolean;

  /**
   * HMR runtime provider passed in by the integration layer, such as unplugin.
   * When omitted, the Babel plugin does not emit wrappers that rely on external
   * HMR helpers.
   */
  bundler?: string;
}
const DEFAULT_OPTIONS: PluginOptions = {
  mode: RENDER_MODE.CLIENT,
  hmr: false,
  props: true,
  signalPrefix: '$',
  delegateEvents: true,
  omitClosingTags: false,
};

/**
 * Resolves options.
 */
export function resolveOptions(
  opts: PluginOptions = {},
  filename?: string,
): PluginOptions & { filename?: string } {
  const mode = opts.mode ?? DEFAULT_OPTIONS.mode;
  if (!Object.values(RENDER_MODE).includes(mode as RENDER_MODE)) {
    throw new Error(
      `Invalid render mode "${mode}". Expected one of: ${Object.values(RENDER_MODE).join(', ')}.`,
    );
  }

  return {
    ...DEFAULT_OPTIONS,
    ...opts,
    mode,
    hmr: mode === RENDER_MODE.CLIENT ? (opts.hmr ?? DEFAULT_OPTIONS.hmr) : false,
    filename: filename || 'unknown',
  };
}
