import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addEvent } from '../../src/operations/event';

describe('eventHandlers module', () => {
  let element: HTMLElement;
  let listener: EventListener;

  beforeEach(() => {
    element = document.createElement('div');
    listener = vi.fn();

    // Add to DOM to make events work properly
    document.body.appendChild(element);

    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.removeChild(element);
    vi.restoreAllMocks();
  });

  describe('addEvent function', () => {
    it('should add event listener to element', () => {
      const addEventSpy = vi.spyOn(element, 'addEventListener');

      addEvent(element, 'click', listener);

      expect(addEventSpy).toHaveBeenCalledWith('click', listener, undefined);
    });

    it('should pass options to addEventListener', () => {
      const options = { capture: true, passive: true };
      const addEventSpy = vi.spyOn(element, 'addEventListener');

      addEvent(element, 'click', listener, options);

      expect(addEventSpy).toHaveBeenCalledWith('click', listener, options);
    });

    it('should return cleanup function that removes event listener', () => {
      const removeEventSpy = vi.spyOn(element, 'removeEventListener');
      const options = { capture: true };

      const cleanup = addEvent(element, 'click', listener, options);

      // Execute cleanup function
      cleanup();

      expect(removeEventSpy).toHaveBeenCalledWith('click', listener, options);
    });

    it('should handle different event types', () => {
      const eventTypes = ['click', 'mousedown', 'keypress', 'focus', 'blur'];
      const addEventSpy = vi.spyOn(element, 'addEventListener');

      eventTypes.forEach(type => {
        addEvent(element, type, listener);
      });

      eventTypes.forEach(type => {
        expect(addEventSpy).toHaveBeenCalledWith(type, listener, undefined);
      });
    });

    it('should trigger the event handler when event occurs', () => {
      addEvent(element, 'click', listener);

      // Simulate click event
      element.click();

      expect(listener).toHaveBeenCalled();
    });

    it('should not trigger handler after cleanup', () => {
      const cleanup = addEvent(element, 'click', listener);

      // Execute cleanup function
      cleanup();

      // Simulate click event
      element.click();

      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle custom events', () => {
      const customEvent = new CustomEvent('custom', { detail: { test: true } });
      const customListener = vi.fn();

      addEvent(element, 'custom', customListener);

      // Dispatch custom event
      element.dispatchEvent(customEvent);

      expect(customListener).toHaveBeenCalled();
      const eventArg = customListener.mock.calls[0][0];
      expect(eventArg.type).toBe('custom');
      expect(eventArg.detail.test).toBe(true);
    });

    // Add tests for event delegation
    describe('event delegation', () => {
      let parent: HTMLElement;
      let child: HTMLElement;

      beforeEach(() => {
        // Create parent-child element structure
        parent = document.createElement('div');
        child = document.createElement('button');
        child.className = 'child-button';

        parent.appendChild(child);
        document.body.appendChild(parent);
      });

      afterEach(() => {
        document.body.removeChild(parent);
      });

      it('should delegate events to matching child elements', () => {
        const delegateListener = vi.fn();

        // Add delegated event listener
        addEvent(parent, 'click', delegateListener, {
          delegate: '.child-button',
        });

        // Click the child element
        child.click();

        // Delegate listener should be called
        expect(delegateListener).toHaveBeenCalled();
      });

      it('should not trigger handler for non-matching elements', () => {
        const delegateListener = vi.fn();

        // Add delegated event listener
        addEvent(parent, 'click', delegateListener, {
          delegate: '.not-matching',
        });

        // Click the child element
        child.click();

        // Delegate listener should not be called
        expect(delegateListener).not.toHaveBeenCalled();
      });

      it('should clean up delegated events correctly', () => {
        const delegateListener = vi.fn();

        // Add delegated event listener
        const cleanup = addEvent(parent, 'click', delegateListener, {
          delegate: '.child-button',
        });

        // Execute cleanup function
        cleanup();

        // Click the child element
        child.click();

        // Delegate listener should not be called
        expect(delegateListener).not.toHaveBeenCalled();
      });
    });
  });
});
