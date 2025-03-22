/**
 * Extended event options with delegation support
 * @public
 */
export interface EventOptions extends AddEventListenerOptions {
  /**
   * CSS selector for event delegation
   * When provided, the event will only trigger if the target matches this selector
   */
  delegate?: string;
}

/**
 * Event handler cleanup function
 * @public
 */
export type EventCleanup = () => void;

/**
 * Adds an event listener to an element with optional delegation
 * Optimized for performance with delegation pattern
 *
 * @param el - The element to attach the event to
 * @param event - The event name (e.g., 'click', 'input')
 * @param handler - The event handler function
 * @param options - Additional event options including delegation
 * @returns A cleanup function to remove the event listener
 * @public
 */
export function addEvent(
  el: Element,
  event: string,
  handler: EventListener,
  options?: EventOptions,
): EventCleanup {
  // Fast path: no delegation
  if (!options?.delegate) {
    el.addEventListener(event, handler, options);
    return () => el.removeEventListener(event, handler, options);
  }

  // Create delegated handler
  const delegateSelector = options.delegate;
  const delegatedHandler = function (this: Element, e: Event) {
    // Find the closest matching element to the event target
    const target = (e.target as Element).closest(delegateSelector);

    // Only call the handler if the target exists and is a child of the element
    if (target && el.contains(target)) {
      // Call with the matching target as 'this'
      handler.call(target, e);
    }
  };

  // Store original handler for cleanup
  (delegatedHandler as any).__original = handler;

  // Add the event listener
  el.addEventListener(event, delegatedHandler, options);

  // Return cleanup function
  return () => {
    el.removeEventListener(event, delegatedHandler, options);
  };
}

/**
 * Creates a delegated event handler
 * Useful for attaching events to dynamic elements
 *
 * @param selector - CSS selector to match target elements
 * @param handler - The event handler function
 * @returns A delegated event handler
 * @public
 */
export function delegate(
  selector: string,
  handler: (e: Event, target: Element) => void,
): EventListener {
  return (e: Event) => {
    const target = (e.target as Element).closest(selector);
    if (target) {
      handler(e, target);
    }
  };
}
