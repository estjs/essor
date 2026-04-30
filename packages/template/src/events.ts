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
    while (handleNode() && (node = node._$host || node.parentNode || node.host));
  };

  // simulate currentTarget
  Object.defineProperty(e, 'currentTarget', {
    configurable: true,
    /**
     * Returns the current delegated target for the event.
     */
    get() {
      return node || document;
    },
  });

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
  // Mixing portals and shadow dom can lead to a nonstandard target, so reset here.
  reTargetEvent(e, oriTarget!);
}

/**
 * Symbol for storing delegated events on document
 */
const $EVENTS = Symbol('_$EVENTS');

/**
 * Set up event delegation for specified event types.
 *
 * @param eventNames - Array of event names to delegate.
 * @param document - Document to attach events to (defaults to window.document).
 */
export function delegateEvents(eventNames: string[], document: Document = window.document): void {
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
 * @param document - Document to clear events from (defaults to window.document).
 */
export function clearDelegatedEvents(document: Document = window.document): void {
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
 * @returns {void}
 */
export function addEventListener(
  element: Element,
  event: string,
  handler: EventListener,
  options?: AddEventListenerOptions,
): void {
  const cleanup = addEvent(element, event, handler, options);

  if (getActiveScope()) {
    onCleanup(cleanup);
  }
}
