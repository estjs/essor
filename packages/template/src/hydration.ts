import { isBrowser, warn } from '@estjs/shared';
import { patchAttr } from './operations/attr';
import { patchClass } from './operations/class';
import { patchStyle } from './operations/style';
import { template } from './renderer';

// ---------------------------------------------------------------------------
// Hydration key counter (mirrors server-side getHydrationKey / resetHydrationKey)
// ---------------------------------------------------------------------------

let _hydrationKey = 0;

/**
 * Returns a new hydration key.
 *
 * @returns The new hydration key as a string.
 */
export function getHydrationKey(): string {
  return String(_hydrationKey++);
}

/**
 * Resets the client-side hydration key counter.
 *
 * @returns {void}
 */
export function resetHydrationKey(): void {
  _hydrationKey = 0;
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
 * Mirrors SolidJS's sharedConfig.registry / gatherHydratable().
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
  for (const node of Array.from(nodes)) {
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
  // eslint-disable-next-line no-cond-assign
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
  return { start, end: start, nodes };
}

/**
 * Begins hydration.
 *
 * @param root - The root element to hydrate.
 */
export function beginHydration(root: Element): void {
  _isHydrating = true;
  _hydrationKey = 0;
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
      _registry.delete(key);
      return node; // TRUE DOM reuse — no cloneNode
    }

    // Mismatch: SSR node not found, fall back to CSR creation
    warn(`[essor] hydration mismatch: no SSR element for key "${key}"`);
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
