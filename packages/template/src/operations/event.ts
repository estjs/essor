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
  if (!options?.delegate) {
    el.addEventListener(event, handler, options);
    return () => el.removeEventListener(event, handler, options);
  }

  // Delegation path: use simple wrapper
  const selector = options.delegate;
  const wrappedHandler = (e: Event) => {
    const target = e.target as Element;
    if (target.matches(selector) || target.closest(selector)) {
      handler.call(el, e);
    }
  };

  // Clean options object by removing delegate property
  const cleanOptions = { ...options };
  cleanOptions.delegate = undefined;

  // Add the event listener with the wrapped handler
  el.addEventListener(event, wrappedHandler, cleanOptions);

  // Return cleanup function
  return () => {
    el.removeEventListener(event, wrappedHandler, cleanOptions);
  };
}
