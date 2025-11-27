import { isFunction, isString } from '@estjs/shared';

/**
 * Event handler for delegated events
 * @param {Event} e - The event object
 */
function eventHandler(e: Event): void {
  let node = e.target as any;
  const key = `${e.type}`;
  const oriTarget = e.target;
  const oriCurrentTarget = e.currentTarget;

  /**
   * Retarget the event's target property
   * @param {EventTarget} value - New target value
   */
  const reTarget = (value: EventTarget) =>
    Object.defineProperty(e, 'target', {
      configurable: true,
      value,
    });

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
      reTarget(node.host);
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
    get() {
      return node || document;
    },
  });

  if (e.composedPath) {
    const path = e.composedPath();
    reTarget(path[0]);
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
  reTarget(oriTarget!);
}

/**
 * Symbol for storing delegated events on document
 */
const $EVENTS = Symbol('_$EVENTS');

/**
 * Set up event delegation for specified event types
 * @param {string[]} eventNames - Array of event names to delegate
 * @param {Document} document - Document to attach events to (defaults to window.document)
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
 * Clear all delegated events from document
 * @param {Document} document - Document to clear events from (defaults to window.document)
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
