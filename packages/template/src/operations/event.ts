/**
 * Extended listener options with optional event delegation support.
 */
export interface EventOptions extends AddEventListenerOptions {
  /**
   * Selector used for event delegation.
   *
   * When provided, the handler only runs if the event target matches the selector.
   */
  delegate?: string;
}

/**
 * Cleanup function signature for event listeners.
 */
export type EventCleanup = () => void;

/**
 * Adds an event listener to an element with optional simple delegation.
 *
 * Without `delegate`, this is a thin wrapper around native `addEventListener()`.
 * When `delegate` is provided, the runtime first checks the selector match before
 * dispatching the real handler to the caller.
 *
 * @param el - The element to add the listener to.
 * @param event - The name of the event to listen for.
 * @param handler - The event handler function.
 * @param options - Optional event listener options.
 * @returns A cleanup function that removes the listener.
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

  // Delegation path: match the selector first, then forward the event to the caller.
  const selector = options.delegate;
  /**
   * Dispatches delegated events only for matching descendants.
   */
  const wrappedHandler = (e: Event) => {
    const target = e.target as Element;
    if (target.closest(selector)) {
      handler.call(el, e);
    }
  };

  // Extract delegate from options and pass the rest to addEventListener
  const { delegate: _, ...nativeOptions } = options;

  el.addEventListener(event, wrappedHandler, nativeOptions);

  return () => {
    el.removeEventListener(event, wrappedHandler, nativeOptions);
  };
}
