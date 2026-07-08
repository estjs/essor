import { HYDRATION_ANCHOR_ATTR, isBrowser, warn } from '@estjs/shared';
import { patchAttr } from './operations/attr';
import { patchClass } from './operations/class';
import { patchStyle } from './operations/style';
import { template } from './renderer';

// ---------------------------------------------------------------------------
// Hydration key counter
// ---------------------------------------------------------------------------

let _hydrationKey = 0;

export function getHydrationKey(): string {
  return String(_hydrationKey++);
}

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

export function claimHydratedNodes(parent: Node, expected: Node[], before?: Node): Node[] | null {
  if (!_isHydrating || (before && before.parentNode !== parent)) return null;
  if (expected.length === 0) return [];

  const claimed: Node[] = new Array(expected.length);
  let cursor: Node | null = before ? before.previousSibling : parent.lastChild;

  for (let i = expected.length - 1; i >= 0; i--) {
    const expectedNode = expected[i];

    const expectedType = expectedNode.nodeType;
    if (expectedType === Node.TEXT_NODE) {
      const expectedText = expectedNode.textContent ?? '';

      if (expectedText === '') {
        if (cursor?.nodeType === Node.TEXT_NODE && (cursor.textContent ?? '') === '') {
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

      if (!cursor) return null;
      if (cursor.nodeType !== Node.TEXT_NODE) return null;

      const existingText = cursor.textContent ?? '';
      if (existingText === expectedText) {
        claimed[i] = cursor;
        cursor = cursor.previousSibling;
        continue;
      }

      if (!existingText.endsWith(expectedText)) return null;

      const prefix = existingText.slice(0, existingText.length - expectedText.length);
      if (!prefix) return null;
      const prefixNode = document.createTextNode(prefix);
      parent.insertBefore(prefixNode, cursor);
      cursor.textContent = expectedText;
      claimed[i] = cursor;
      cursor = prefixNode;
      continue;
    }

    if (!cursor) return null;
    if (cursor.nodeType !== expectedType) return null;
    if (expectedType === Node.ELEMENT_NODE) {
      if ((cursor as Element).tagName !== (expectedNode as Element).tagName) return null;
    } else if (
      expectedType === Node.COMMENT_NODE &&
      (cursor as Comment).data !== (expectedNode as Comment).data
    ) {
      return null;
    }

    claimed[i] = cursor;
    cursor = cursor.previousSibling;
  }

  return claimed;
}

function resolveHydrationKey(parent: Element): string | null {
  const el = parent as HTMLElement;
  return el.dataset.hk ?? (parent.closest('[data-hk]') as HTMLElement | null)?.dataset.hk ?? null;
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
