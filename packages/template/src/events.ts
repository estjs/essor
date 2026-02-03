import { isFunction, isString } from '@estjs/shared';

/**
 * Retarget the event's target property
 * @param event - Event object to retarget
 * @param value - New target value
 */
function reTarget(event: Event, value: EventTarget): void {
  Object.defineProperty(event, 'target', {
    configurable: true,
    value,
  });
}

/**
 * Handle event on current node
 * @param node - Current node to handle
 * @param event - Event object
 * @param key - Event type key
 * @returns Whether to continue propagation
 */
function handleNodeEvent(node: any, event: Event, key: string): boolean {
  const handler = node[`_$${key}`];
  if (handler && isFunction(handler) && !node.disabled) {
    const data = node[`${key}Data`];
    data ? handler.call(node, data, event) : handler.call(node, event);
    if (event.cancelBubble) return false;
  }

  // Handle host element retargeting
  if (
    node.host &&
    !isString(node.host) &&
    !node.host._$host &&
    isFunction(node.contains) &&
    node.contains(event.target)
  ) {
    reTarget(event, node.host);
  }
  return true;
}

/**
 * Walk up the DOM tree handling events
 * @param startNode - Initial node to start from
 * @param event - Event object
 * @param key - Event type key
 * @returns Final node after walking
 */
function walkUpTree(startNode: any, event: Event, key: string): any {
  let node = startNode;
  while (handleNodeEvent(node, event, key) && (node = node._$host || node.parentNode || node.host));
  return node;
}

/**
 * Event handler for delegated events
 * @param event - The event object
 */
function eventHandler(event): void {
  let node = event.target;
  const key = `${event.type}`;
  const oriTarget = event.target;
  const oriCurrentTarget = event.currentTarget;

  // Simulate currentTarget
  Object.defineProperty(event, 'currentTarget', {
    configurable: true,
    get() {
      return node || document;
    },
  });

  if (event.composedPath) {
    const path = event.composedPath();
    reTarget(event, path[0]);
    for (let i = 0; i < path.length - 2; i++) {
      node = path[i];
      if (!handleNodeEvent(node, event, key)) break;
      if (node._$host) {
        node = node._$host;
        // Bubble up from portal mount instead of composedPath
        node = walkUpTree(node, event, key);
        break;
      }
      if (node.parentNode === oriCurrentTarget) {
        break; // Don't bubble above root of event delegation
      }
    }
  } else {
    // Fallback for browsers that don't support composedPath
    node = walkUpTree(node, event, key);
  }

  // Mixing portals and shadow dom can lead to a nonstandard target, so reset here
  reTarget(event, oriTarget!);
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
