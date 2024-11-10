type EventHandler = (event: Event) => void;

interface DelegatedEvent {
  type: string;
  handler: EventHandler;
  selector?: string;
  target?: HTMLElement;
  options?: AddEventListenerOptions;
}

export class EventDelegate {
  private static instance: EventDelegate;
  private handlers: Map<string, Set<DelegatedEvent>> = new Map();
  private rootElement: HTMLElement;

  private constructor() {
    this.rootElement = document.body;
    this.setupRootListeners();
  }

  static getInstance(): EventDelegate {
    if (!EventDelegate.instance) {
      EventDelegate.instance = new EventDelegate();
    }
    return EventDelegate.instance;
  }

  private setupRootListeners(): void {
    // listen to all bubbling events
    const bubblingEvents = [
      'click',
      'mousedown',
      'mouseup',
      'mousemove',
      'touchstart',
      'touchend',
      'touchmove',
      'keydown',
      'keyup',
      'keypress',
      'change',
      'input',
      'submit',
    ];

    bubblingEvents.forEach(eventType => {
      this.rootElement.addEventListener(
        eventType,
        (event: Event) => {
          this.handleEvent(event);
        },
        { passive: true },
      );
    });
  }

  private handleEvent(event: Event): void {
    const handlers = this.handlers.get(event.type);
    if (!handlers) return;

    let currentTarget = event.target as HTMLElement;
    const path: HTMLElement[] = [];

    while (currentTarget && currentTarget !== this.rootElement) {
      path.push(currentTarget);
      currentTarget = currentTarget.parentElement as HTMLElement;
    }

    handlers.forEach(({ selector, handler, target: delegateTarget }) => {
      // if a specific target element is specified, only trigger on that element
      if (delegateTarget && !path.includes(delegateTarget)) {
        return;
      }

      for (const element of path) {
        if (!selector || element.matches(selector)) {
          handler.call(element, event);
          if (event.cancelBubble) break;
        }
      }
    });
  }

  addDelegate(
    eventType: string,
    target: HTMLElement | string | EventHandler,
    handler?: EventHandler,
    options?: AddEventListenerOptions,
  ): () => void {
    const actualHandler = typeof target === 'function' ? target : handler!;
    const actualSelector = typeof target === 'string' ? target : undefined;
    const actualTarget = target instanceof HTMLElement ? target : undefined;

    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }

    const eventData: DelegatedEvent = {
      type: eventType,
      handler: actualHandler,
      selector: actualSelector,
      target: actualTarget,
      options,
    };

    this.handlers.get(eventType)!.add(eventData);

    return () => {
      const handlers = this.handlers.get(eventType);
      if (handlers) {
        handlers.delete(eventData);
        if (handlers.size === 0) {
          this.handlers.delete(eventType);
        }
      }
    };
  }

  // used to optimize performance
  batchAddDelegates(
    events: Array<{
      type: string;
      selector: string | EventHandler;
      handler?: EventHandler;
      options?: AddEventListenerOptions;
    }>,
  ): () => void {
    const cleanupFns: Array<() => void> = [];

    events.forEach(event => {
      cleanupFns.push(this.addDelegate(event.type, event.selector, event.handler, event.options));
    });

    // return a batch cleanup function
    return () => cleanupFns.forEach(fn => fn());
  }
}

export const eventDelegate = EventDelegate.getInstance();
