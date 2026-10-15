/**
 * Compile protocol — the versioned contract between the compiler and the runtime.
 *
 * Every wire marker the compiler embeds in its output, and every marker the
 * runtime parses back out, is defined centrally here. Both sides import these
 * constants (the compiler imports them to generate output, the runtime imports
 * them to parse it) to ensure compile-time and runtime markers never drift.
 */

/** Compile protocol version asserted by compiler and runtime. */
export const PROTOCOL_VERSION = 3 as const;

/**
 * Text/node insertion placeholder comment inside a client template. Every
 * dynamic slot produces one `<!>` comment anchor in the template HTML; the
 * runtime locates it in one step with `anchor()`.
 */
export const ANCHOR_OPEN = '<!>' as const;

/**
 * Reserved. Historical SSR start-of-dynamic-slot marker (`<!$>`). Block
 * slots use `SLOT_OPEN`/`SLOT_CLOSE` so client templates and SSR output
 * share one byte layout for hydration.
 */
export const ANCHOR_END = '<!$>' as const;

/** Reserved. Historical SSR end-of-dynamic-slot marker. */
export const ANCHOR_CLOSE = '<!/>' as const;

/** Server output wrapper — start. Same value on client templates (block slots). */
export const SLOT_OPEN = '<!--$-->' as const;

/** Server output wrapper — end. */
export const SLOT_CLOSE = '<!--/-->' as const;

/** Opening marker for an SSR Portal call site. */
export const PORTAL_OPEN = '<!--$portal-->' as const;

/** Closing marker for an SSR Portal call site. */
export const PORTAL_CLOSE = '<!--/portal-->' as const;

/** Opening marker for an SSR Portal block in its target container. */
export const PORTAL_TARGET_OPEN = '<!--$portal-target-->' as const;

/** Closing marker for an SSR Portal block in its target container. */
export const PORTAL_TARGET_CLOSE = '<!--/portal-target-->' as const;

/** Spread snapshot merge key in compiled output. */
export const SPREAD_NAME = '_$spread$' as const;

/**
 * Prefix of the element property slot a delegated handler is stored on
 * (`el["_$click"] = fn`). Compiled output assigns the slot directly and the
 * single document-level listener reads it at dispatch time.
 */
export const DELEGATED_SLOT_PREFIX = '_$' as const;
