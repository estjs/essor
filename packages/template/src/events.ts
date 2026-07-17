import { isFunction, isString } from '@estjs/shared';
import { addEvent } from './operations/event';
import { getActiveScope, onCleanup } from './scope';

/**
 * Retargets an event to a delegated host node.
 *
 * @param e - The event object.
 * @param value - The new target value.
 * @returns {void}
 */
function reTargetEvent(e: Event, value: EventTarget): void {
  Object.defineProperty(e, 'target', {
    configurable: true,
    value,
  });
}

/**
 * Event handler for delegated events.
 *
 * @param e - The event object.
 */
function eventHandler(e: Event): void {
  let node = e.target as any;
  const key = e.type;
  const oriTarget = e.target;
  const oriCurrentTarget = e.currentTarget;

  /**
   * Handle event on current node
   * @returns {boolean} Whether to continue propagation
   */
  const handleNode = (): boolean => {
    const handler = node[`_$${key}`];
    if (handler && isFunction(handler) && !node.disabled) {
      const data = node[`${key}Data`];
      data ? handler.call(node, data, e) : handler.call(node, e);
      if (e.cancelBubble) return false;
    }

    // Handle host element retargeting
    if (
      node.host &&
      !isString(node.host) &&
      !node.host._$host &&
      isFunction(node.contains) &&
      node.contains(e.target)
    ) {
      reTargetEvent(e, node.host);
    }
    return true;
  };

  /**
   * Walk up the DOM tree handling events
   */
  const walkUpTree = (): void => {
    while (handleNode() && (node = node._$host || node.parentNode || node.host)) {
      // Don't process above the delegation root (mirrors the composedPath
      // branch's `node.parentNode === oriCurrentTarget` guard).
      if (node === oriCurrentTarget) break;
    }
  };

  // simulate currentTarget. Save the pre-existing own descriptor (normally
  // none — currentTarget lives on the Event prototype) so it can be restored
  // after dispatch: leaving the getter installed would corrupt
  // currentTarget for every later listener on the same event object.
  const prevCurrentTargetDescriptor = Object.getOwnPropertyDescriptor(e, 'currentTarget');
  Object.defineProperty(e, 'currentTarget', {
    configurable: true,
    /**
     * Returns the current delegated target for the event.
     */
    get() {
      return node || document;
    },
  });

  try {
    if (e.composedPath) {
      const path = e.composedPath();
      reTargetEvent(e, path[0]);
      for (let i = 0; i < path.length - 2; i++) {
        node = path[i] as any;
        if (!handleNode()) break;
        if (node._$host) {
          node = node._$host;
          // bubble up from portal mount instead of composedPath
          walkUpTree();
          break;
        }
        if (node.parentNode === oriCurrentTarget) {
          break; // don't bubble above root of event delegation
        }
      }
    }
    // fallback for browsers that don't support composedPath
    else walkUpTree();
  } finally {
    // Always restore the original target, even if a handler threw — otherwise
    // e.target stays pointing at the delegated node and corrupts every later
    // listener that reads e.target. Mixing portals and shadow DOM can also lead
    // to a nonstandard target, so reset here unconditionally.
    reTargetEvent(e, oriTarget!);

    // Restore currentTarget: remove our own getter so the prototype's native
    // getter takes over again (or reinstate a pre-existing own descriptor).
    if (prevCurrentTargetDescriptor) {
      Object.defineProperty(e, 'currentTarget', prevCurrentTargetDescriptor);
    } else {
      delete (e as any).currentTarget;
    }
  }
}

/**
 * Symbol for storing delegated events on document
 */
const $EVENTS = Symbol('_$EVENTS');

/**
 * Set up event delegation for specified event types.
 *
 * @param eventNames - Array of event names to delegate.
 * @param document - Document to attach events to (defaults to the global document).
 */
export function delegateEvents(
  eventNames: string[],
  document: Document = globalThis.document,
): void {
  if (!document) return;
  const docWithEvents = document as Document & { [$EVENTS]?: Set<string> };
  const eventSet = docWithEvents[$EVENTS] || (docWithEvents[$EVENTS] = new Set<string>());

  for (const name of eventNames) {
    if (!eventSet.has(name)) {
      eventSet.add(name);
      document.addEventListener(name, eventHandler);
    }
  }
}

/**
 * Clear all delegated events from document.
 *
 * @param document - Document to clear events from (defaults to the global document).
 */
export function clearDelegatedEvents(document: Document = globalThis.document): void {
  if (!document) return;
  const docWithEvents = document as Document & { [$EVENTS]?: Set<string> };
  const eventSet = docWithEvents[$EVENTS];
  if (eventSet) {
    for (const name of eventSet.keys()) {
      document.removeEventListener(name, eventHandler);
    }
    delete docWithEvents[$EVENTS];
  }
}
/**
 * Registers an event listener and scopes its cleanup when needed.
 *
 * @param element - The element to add the listener to.
 * @param event - The event name.
 * @param handler - The event handler.
 * @param options - Optional event listener options.
 * @returns {() => void} Idempotent disposer that removes the listener. With
 *   an active scope the disposer is ALSO registered via onCleanup, so most
 *   callers can ignore it; standalone callers (no scope) must invoke it to
 *   avoid leaking the listener.
 */
export function addEventListener(
  element: Element,
  event: string,
  handler: EventListener,
  options?: AddEventListenerOptions,
): () => void {
  const cleanup = addEvent(element, event, handler, options);

  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    cleanup();
  };

  if (getActiveScope()) {
    onCleanup(dispose);
  }

  return dispose;
}
