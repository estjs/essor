import {
  HYDRATION_ANCHOR_ATTR,
  HYDRATION_RANGE_START_PREFIX,
  isBrowser,
  warn,
} from '@estjs/shared';
import { requestSlotProviders } from './request-slots';
import { patchAttr } from './operations/attr';
import { patchClass } from './operations/class';
import { patchStyle } from './operations/style';
import { template } from './renderer';

// ---------------------------------------------------------------------------
// Hydration key counter
// ---------------------------------------------------------------------------

let _hydrationKey = 0;

/**
 * Host-injectable storage slot for the hydration key counter.
 *
 * On the client the counter lives in the module-global `_hydrationKey` above.
 * During SSR, `@estjs/server` installs a provider backed by AsyncLocalStorage
 * so concurrent requests each get an independent counter. A provider returning
 * `undefined` (or no provider at all) falls back to the module global.
 */
export interface HydrationKeySlot {
  hydrationKey: number;
}

type HydrationKeySlotProvider = () => HydrationKeySlot | undefined;

/**
 * Install (or clear) the request-local hydration-key slot provider.
 *
 * Internal: consumed by `@estjs/server` via `@estjs/template/internal`.
 *
 * Stored in the cross-bundle `requestSlotProviders()` registry (NOT a module
 * variable): the CJS build inlines a separate copy of this module into each
 * entry bundle, and a module-level provider variable would be written by one
 * copy and read by the other. See request-slots.ts.
 */
export function setHydrationKeySlotProvider(provider: HydrationKeySlotProvider | undefined): void {
  requestSlotProviders().hydrationKey = provider;
}

function hydrationKeySlot(): HydrationKeySlot | undefined {
  const provider = requestSlotProviders().hydrationKey as HydrationKeySlotProvider | undefined;
  return provider?.();
}

export function getHydrationKey(): string {
  const slot = hydrationKeySlot();
  if (slot) {
    return String(slot.hydrationKey++);
  }
  return String(_hydrationKey++);
}

export function resetHydrationKey(): void {
  const slot = hydrationKeySlot();
  if (slot) {
    slot.hydrationKey = 0;
  } else {
    _hydrationKey = 0;
  }
}

// ---------------------------------------------------------------------------
// Hydration state + registry
// ---------------------------------------------------------------------------

/**
 * Module-private hydration flag.
 *
 * Read via `isHydrating()` instead of importing as a `let` binding — this
 * avoids cross-bundle "live binding" pitfalls when consumers go through a
 * barrel-export (`import { isHydrating } from '@estjs/template'`).
 */
let _isHydrating = false;

/**
 * Returns whether the runtime is currently in the hydration first-pass.
 *
 * @returns True while hydrating, false otherwise.
 */
export function isHydrating(): boolean {
  return _isHydrating;
}

/**
 * Pre-built map of data-hk → Element, populated by beginHydration().
 */
const _registry = new Map<string, Element>();

/**
 * Gather all [data-hk] elements under `root` into the registry.
 * Called once at hydration start — O(n) DOM query, then O(1) lookups.
 *
 * @param root - The root element to scan.
 */
function gatherHydratable(root: Element): void {
  const nodes = root.querySelectorAll('[data-hk]');
  for (const node of nodes) {
    const key = (node as HTMLElement).dataset.hk;
    if (key != null && !_registry.has(key)) {
      _registry.set(key, node as Element);
    }
  }
}

// ---------------------------------------------------------------------------
// Teleport (Portal) hydration anchors
// ---------------------------------------------------------------------------

/** FIFO queue of `<!--teleport-anchor-->` comments at Portal call sites. */
const _teleportCallsiteAnchors: Comment[] = [];

/** Per-target FIFO of `<!--teleport-start-->` comments inside teleport targets. */
const _teleportTargetStarts = new Map<Element, Comment[]>();

/** Scan `document.body` for teleport comment markers, classifying each into its queue. */
function gatherTeleportAnchors(): void {
  if (typeof document === 'undefined') return;
  const walker = document.createNodeIterator(document.body, NodeFilter.SHOW_COMMENT);
  let node: Comment | null;

  while ((node = walker.nextNode() as Comment | null)) {
    const data = node.data;
    if (data === 'teleport-anchor') {
      _teleportCallsiteAnchors.push(node);
    } else if (data === 'teleport-start') {
      const parent = node.parentElement;
      if (!parent) continue;
      let bucket = _teleportTargetStarts.get(parent);
      if (!bucket) {
        bucket = [];
        _teleportTargetStarts.set(parent, bucket);
      }
      bucket.push(node);
    }
  }
}

/** Pop the next call-site anchor comment, or `null` if exhausted. */
export function consumeTeleportAnchor(): Comment | null {
  return _teleportCallsiteAnchors.shift() ?? null;
}

/** Pop the next teleport block from `target`, returning start/end markers and inner nodes. */
export function consumeTeleportBlock(
  target: Element,
): { start: Comment; end: Comment; nodes: Node[] } | null {
  const bucket = _teleportTargetStarts.get(target);
  const start = bucket?.shift();
  if (!start) return null;

  const nodes: Node[] = [];
  let cursor: Node | null = start.nextSibling;
  while (cursor) {
    if (cursor.nodeType === Node.COMMENT_NODE && (cursor as Comment).data === 'teleport-end') {
      return { start, end: cursor as Comment, nodes };
    }
    nodes.push(cursor);
    cursor = cursor.nextSibling;
  }

  // Malformed block — no <!--teleport-end--> found. Return null to signal
  // a hydration mismatch rather than returning `{ start, end: start }` which
  // would be semantically incorrect.
  if (__DEV__) {
    warn('[Portal] hydration: orphaned <!--teleport-start--> without matching <!--teleport-end-->');
  }
  return null;
}

/**
 * Begins hydration.
 *
 * @param root - The root element to hydrate.
 */
export function beginHydration(root: Element): void {
  _isHydrating = true;
  resetHydrationKey();
  _registry.clear();
  _teleportCallsiteAnchors.length = 0;
  _teleportTargetStarts.clear();
  gatherHydratable(root);
  gatherTeleportAnchors();
}

/**
 * Ends hydration.
 *
 * @returns {void}
 */
export function endHydration(): void {
  _isHydrating = false;
  _registry.clear();
  _teleportCallsiteAnchors.length = 0;
  _teleportTargetStarts.clear();
}

/**
 * Nodes adopted from SSR markup during the current hydration pass: elements
 * claimed by `claimHydratedNodes` and registry hits in `getRenderedElement`.
 * Only the adopted TOP-LEVEL nodes are marked — `isNodeHydrated` walks up the
 * parent chain, so binds targeting descendants of a claimed element resolve
 * correctly. Consumed by `bindElement`: the hydration first-write
 * skip only applies to SSR-adopted nodes; controls freshly created on the
 * client during a claim-mismatch fallback must receive their first write.
 */
const _hydratedNodes = new WeakSet<Node>();

/** Record `node` as adopted from SSR markup (not client-created). */
export function markNodeHydrated(node: Node): void {
  _hydratedNodes.add(node);
}

/** Whether `node` or any ancestor was adopted from SSR markup. */
export function isNodeHydrated(node: Node): boolean {
  let cursor: Node | null = node;
  while (cursor) {
    if (_hydratedNodes.has(cursor)) return true;
    cursor = cursor.parentNode;
  }
  return false;
}

export type HydrationBoundaryKind = 'comment' | 'element' | 'tail';

interface ParsedHydrationRangeStart {
  kind: HydrationBoundaryKind;
  hydrationKey: string;
  slotIndex: string;
}

const HYDRATION_RANGE_START_RE = new RegExp(
  `^${HYDRATION_RANGE_START_PREFIX}:([cet]):(.+):(\\d+)$`,
);

function hydrationBoundaryCode(kind: HydrationBoundaryKind): 'c' | 'e' | 't' {
  return kind === 'comment' ? 'c' : kind === 'element' ? 'e' : 't';
}

function parseHydrationRangeStart(start: Comment): ParsedHydrationRangeStart | null {
  const match = HYDRATION_RANGE_START_RE.exec(start.data);
  if (!match) return null;

  const kind =
    match[1] === 'c' ? 'comment' : match[1] === 'e' ? 'element' : match[1] === 't' ? 'tail' : null;
  if (!kind) return null;

  return {
    kind,
    hydrationKey: match[2],
    slotIndex: match[3],
  };
}

interface HydrationClaimCursor {
  parent: Node;
  start: Comment;
  before: Node | undefined;
  originalNodes: Node[];
  claimed: Set<Node>;
  index: number;
  failed: boolean;
}

let activeHydrationCursor: HydrationClaimCursor | null = null;

function createHydrationCursor(
  parent: Node,
  before: Node | undefined,
  start: Comment,
): HydrationClaimCursor | null {
  if (start.parentNode !== parent) return null;

  const parsed = parseHydrationRangeStart(start);
  const hydrationKey = parent instanceof Element ? resolveHydrationKey(parent) : null;
  if (!parsed || !hydrationKey || parsed.hydrationKey !== hydrationKey) return null;

  const expectedBoundaryKey = `${parsed.hydrationKey}-${parsed.slotIndex}`;
  if (parsed.kind === 'comment') {
    if (
      before?.parentNode !== parent ||
      before.nodeType !== Node.COMMENT_NODE ||
      (before as Comment).data !== expectedBoundaryKey
    ) {
      return null;
    }
  } else if (parsed.kind === 'element') {
    if (
      !(before instanceof Element) ||
      before.parentNode !== parent ||
      before.getAttribute(HYDRATION_ANCHOR_ATTR) !== expectedBoundaryKey
    ) {
      return null;
    }
  } else if (before != null) {
    return null;
  }

  const originalNodes: Node[] = [];
  let cursor: Node | null = start.nextSibling;
  while (cursor && cursor !== before) {
    originalNodes.push(cursor);
    cursor = cursor.nextSibling;
  }
  if (parsed.kind === 'tail' ? cursor !== null : cursor !== before) return null;

  return {
    parent,
    start,
    before,
    originalNodes,
    claimed: new Set(),
    index: 0,
    failed: false,
  };
}

/** Remove unclaimed SSR nodes and the range start marker; report exactness. */
function finishHydrationCursor(cursor: HydrationClaimCursor): boolean {
  const exact = !cursor.failed && cursor.index === cursor.originalNodes.length;
  if (!exact) {
    for (const node of cursor.originalNodes) {
      if (!cursor.claimed.has(node) && node.parentNode === cursor.parent) {
        (node as ChildNode).remove();
      }
    }
    if (__DEV__) {
      warn(
        '[essor] hydration mismatch: SSR nodes did not match client render; replaced with CSR nodes',
      );
    }
  }
  cursor.start.remove();
  return exact;
}

/**
 * Run one owned hydration range with a forward-only claim cursor.
 *
 * On a partial mismatch, `onMismatch` runs after the range is cleaned up
 * (unclaimed SSR nodes removed, cursor popped) so the caller can re-render
 * adopted content as pure CSR.
 */
export function runWithHydrationRange<T>(
  parent: Node,
  before: Node | undefined,
  start: Comment,
  fn: () => T,
  onMismatch?: () => void,
): T {
  const cursor = createHydrationCursor(parent, before, start);
  if (!cursor) return fn();

  const previous = activeHydrationCursor;
  activeHydrationCursor = cursor;
  try {
    return fn();
  } finally {
    activeHydrationCursor = previous;
    if (!finishHydrationCursor(cursor)) onMismatch?.();
  }
}

/**
 * Run `fn` with hydration suspended: `getRenderedElement` takes the CSR
 * clone path without consuming hydration keys, so a CSR fallback re-render
 * cannot steal a sibling range's SSR nodes.
 */
export function runWithoutHydration<T>(fn: () => T): T {
  if (!_isHydrating) return fn();
  _isHydrating = false;
  try {
    return fn();
  } finally {
    _isHydrating = true;
  }
}

export function hasActiveHydrationRange(): boolean {
  return activeHydrationCursor !== null;
}

export function isHydrationNodeClaimed(node: Node): boolean {
  return activeHydrationCursor?.claimed.has(node) ?? false;
}

/** Return the SSR identity for the next exact node in the active owned range. */
export function claimHydrationNode(expected: Node): Node {
  const cursor = activeHydrationCursor;
  if (!cursor || cursor.claimed.has(expected) || cursor.failed) return expected;

  // Runtime-only anchors frame client ownership and have no SSR counterpart.
  if (expected.nodeType === Node.COMMENT_NODE && !isNodeHydrated(expected)) return expected;

  const current = cursor.originalNodes[cursor.index];
  if (expected.nodeType === Node.TEXT_NODE) {
    const expectedText = expected.textContent ?? '';
    if (
      current?.nodeType === Node.TEXT_NODE &&
      (current.textContent ?? '') === expectedText
    ) {
      cursor.index++;
      cursor.claimed.add(current);
      markNodeHydrated(current);
      return current;
    }

    // Empty text has no serialized SSR node. Keep the client identity without
    // preventing later claimable output from consuming the same cursor slot.
    if (expectedText === '') return expected;
    cursor.failed = true;
    return expected;
  }

  if (
    expected instanceof Element &&
    current instanceof Element &&
    current.tagName === expected.tagName
  ) {
    cursor.index++;
    cursor.claimed.add(current);
    markNodeHydrated(current);
    return current;
  }

  if (isNodeHydrated(expected) && current === expected) {
    cursor.index++;
    cursor.claimed.add(current);
    return current;
  }

  cursor.failed = true;
  return expected;
}

/** Conservative backward claim used when no compiler-provided start exists. */
export function claimHydratedNodes(
  parent: Node,
  expected: Node[],
  before?: Node,
): Node[] | null {
  if (!_isHydrating || (before && before.parentNode !== parent)) return null;
  if (expected.length === 0) return [];

  const claimed: Node[] = new Array(expected.length);
  let cursor: Node | null = before ? before.previousSibling : parent.lastChild;

  // On a mismatch the caller falls back to CSR creation via reconcile, which
  // INSERTS fresh nodes without knowing about the SSR ones — leaving the
  // partially-matched SSR nodes in place would duplicate content.
  // Remove only the nodes this call already claimed (the matched tail). The
  // mismatching cursor node is NOT removed: the backward walk has no left
  // boundary, so the cursor may have strayed outside this insert's SSR window
  // onto a preceding static sibling or content owned by another insert.
  const failClaim = (matchedFrom: number): null => {
    for (let j = matchedFrom; j < expected.length; j++) {
      const node = claimed[j];
      if (node && node.parentNode === parent) (node as ChildNode).remove();
    }
    if (__DEV__) {
      warn(
        '[essor] hydration mismatch: SSR nodes did not match client render; replaced with CSR nodes',
      );
    }
    return null;
  };

  for (let i = expected.length - 1; i >= 0; i--) {
    const expectedNode = expected[i];

    const expectedType = expectedNode.nodeType;
    if (expectedType === Node.TEXT_NODE) {
      const expectedText = expectedNode.textContent ?? '';

      if (expectedText === '') {
        if (
          cursor?.nodeType === Node.TEXT_NODE &&
          (cursor.textContent ?? '') === ''
        ) {
          claimed[i] = cursor;
          cursor = cursor.previousSibling;
        } else {
          const emptyNode = document.createTextNode('');
          const anchor = i + 1 < expected.length ? claimed[i + 1] : (before ?? null);
          parent.insertBefore(emptyNode, anchor);
          claimed[i] = emptyNode;
        }
        continue;
      }

      if (!cursor) return failClaim(i + 1);
      if (cursor.nodeType !== Node.TEXT_NODE) return failClaim(i + 1);

      const existingText = cursor.textContent ?? '';
      if (existingText === expectedText) {
        claimed[i] = cursor;
        cursor = cursor.previousSibling;
        continue;
      }

      if (!existingText.endsWith(expectedText)) return failClaim(i + 1);

      const prefix = existingText.slice(0, existingText.length - expectedText.length);
      if (!prefix) return failClaim(i + 1);
      const prefixNode = document.createTextNode(prefix);
      parent.insertBefore(prefixNode, cursor);
      cursor.textContent = expectedText;
      claimed[i] = cursor;
      cursor = prefixNode;
      continue;
    }

    if (!cursor) return failClaim(i + 1);
    if (cursor.nodeType !== expectedType) return failClaim(i + 1);
    if (expectedType === Node.ELEMENT_NODE) {
      if ((cursor as Element).tagName !== (expectedNode as Element).tagName) {
        return failClaim(i + 1);
      }
    } else if (
      expectedType === Node.COMMENT_NODE &&
      (cursor as Comment).data !== (expectedNode as Comment).data
    ) {
      return failClaim(i + 1);
    }

    claimed[i] = cursor;
    cursor = cursor.previousSibling;
  }

  for (const node of claimed) markNodeHydrated(node);
  return claimed;
}

function resolveHydrationKey(parent: Element): string | null {
  const el = parent as HTMLElement;
  return el.dataset.hk ?? (parent.closest('[data-hk]') as HTMLElement | null)?.dataset.hk ?? null;
}

export function hydrationRange(
  parent: Node | null,
  index: number,
  kind: HydrationBoundaryKind,
): Comment | undefined {
  if (!_isHydrating || !(parent instanceof Element) || index < 0) return undefined;

  const hydrationKey = resolveHydrationKey(parent);
  if (!hydrationKey) return undefined;

  const expected = `${HYDRATION_RANGE_START_PREFIX}:${hydrationBoundaryCode(kind)}:${hydrationKey}:${index}`;
  let cursor: Node | null = parent.firstChild;
  while (cursor) {
    if (cursor.nodeType === Node.COMMENT_NODE && (cursor as Comment).data === expected) {
      return cursor as Comment;
    }
    cursor = cursor.nextSibling;
  }

  return undefined;
}

function expectedHydrationSlot(parent: Element | null, index: number): string {
  if (_isHydrating && parent) {
    const key = resolveHydrationKey(parent);
    if (key) return `${key}-${index}`;
  }
  return String(index);
}

export function hydrationMarker(parent: Node | null, index: number): Comment | null {
  if (!parent || index < 0) return null;

  const expected = expectedHydrationSlot(parent instanceof Element ? parent : null, index);
  let fallbackIndex = 0;

  let cursor = parent.firstChild;
  while (cursor) {
    if (cursor.nodeType === Node.COMMENT_NODE) {
      const comment = cursor as Comment;
      if (comment.data === expected) return comment;
      if (!_isHydrating && comment.data === '' && fallbackIndex++ === index) return comment;
    }
    cursor = cursor.nextSibling;
  }

  return null;
}

export function hydrationAnchor(parent: Node | null, index: number): Node | null {
  if (!(parent instanceof Element) || index < 0) return null;

  const expected = expectedHydrationSlot(parent, index);
  let cursor = parent.firstChild;
  while (cursor) {
    if (cursor instanceof Element && cursor.getAttribute(HYDRATION_ANCHOR_ATTR) === expected) {
      return cursor;
    }
    cursor = cursor.nextSibling;
  }
  return null;
}

/** Parse the root tag name from an HTML template string (uppercase). */
function parseRootTagName(html: string): string | null {
  const match = /^\s*<([a-z][\w-]*)/i.exec(html);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Returns a factory function that, when called at component render time:
 * - During hydration: increments the key, looks up the pre-built registry,
 *   and returns the ACTUAL SSR DOM node (no cloneNode).
 * - During CSR: clones the parsed template as usual.
 *
 * @param html - The HTML template string.
 * @returns A factory function that returns a DOM element.
 */
export function getRenderedElement(html: string): () => Element {
  if (!isBrowser()) {
    return () => {
      throw new Error('[essor] getRenderedElement called in non-browser environment');
    };
  }

  let _csrFactory: (() => Element) | null = null;
  let _rootTag: string | null | undefined;

  return (): Element => {
    if (!_isHydrating) {
      // CSR path — clone the template as normal
      if (!_csrFactory) _csrFactory = template(html) as () => Element;
      return _csrFactory();
    }

    // Hydration path — key incremented HERE (render time) to match server order
    const key = getHydrationKey();
    const node = _registry.get(key);

    if (node) {
      // Validate the claim beyond the bare key: a key collision or
      // out-of-sync counter would otherwise adopt a structurally different
      // element and every downstream navigation/effect would corrupt it.
      if (_rootTag === undefined) _rootTag = parseRootTagName(html);
      // Compare uppercase on both sides: foreign-namespace elements (SVG,
      // MathML) keep their original tagName casing ('svg', not 'SVG').
      if (_rootTag === null || node.tagName.toUpperCase() === _rootTag) {
        _registry.delete(key);
        markNodeHydrated(node);
        return node; // TRUE DOM reuse — no cloneNode
      }
      if (__DEV__) {
        warn(
          `[essor] hydration mismatch: SSR element for key "${key}" is <${node.tagName.toLowerCase()}>, ` +
            `template expects <${_rootTag.toLowerCase()}> — falling back to client render`,
        );
      }
      // Remove the wrong SSR node so it doesn't linger next to the CSR copy.
      _registry.delete(key);
      node.remove();
    } else {
      // Mismatch: SSR node not found, fall back to CSR creation
      if (__DEV__) {
        warn(`[essor] hydration mismatch: no SSR element for key "${key}"`);
      }
    }

    if (!_csrFactory) _csrFactory = template(html) as () => Element;
    return _csrFactory();
  };
}

// ---------------------------------------------------------------------------
// Hydrate-mode patch wrappers (silence DOM writes during first hydration run)
// ---------------------------------------------------------------------------

/**
 * Patches class while considering hydration state.
 *
 * @param el - The element to patch.
 * @param prev - Previous class value.
 * @param next - Next class value.
 * @param isSVG - Whether the element is an SVG element.
 */
export function patchClassHydrate(
  el: Element,
  prev: unknown,
  next: unknown,
  isSVG?: boolean,
): void {
  if (_isHydrating) return;
  patchClass(el, prev, next, isSVG);
}

/**
 * Patches attribute while considering hydration state.
 *
 * @param el - The element to patch.
 * @param key - The attribute key.
 * @param prev - Previous attribute value.
 * @param next - Next attribute value.
 */
export function patchAttrHydrate(el: Element, key: string, prev: unknown, next: unknown): void {
  if (_isHydrating) return;
  patchAttr(el, key, prev as never, next as never);
}

/**
 * Patches style while considering hydration state.
 *
 * @param el - The element to patch.
 * @param prev - Previous style value.
 * @param next - Next style value.
 */
export function patchStyleHydrate(el: HTMLElement, prev: unknown, next?: unknown): void {
  if (_isHydrating) return;
  patchStyle(el, prev, next);
}
