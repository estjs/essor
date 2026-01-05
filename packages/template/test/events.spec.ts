import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDelegatedEvents, delegateEvents } from '../src/events';
import { resetEnvironment } from './test-utils';

describe('event delegation', () => {
  beforeEach(() => {
    resetEnvironment();
    clearDelegatedEvents();
  });

  it('delegates events through document', () => {
    delegateEvents(['click']);

    const container = document.createElement('div');
    const button = document.createElement('button');
    const handler = vi.fn();

    // Set handler on the element using the event name as property
    (button as any)._$click = handler;
    container.appendChild(button);
    document.body.appendChild(container);

    button.dispatchEvent(new Event('click', { bubbles: true }));
    expect(handler).toHaveBeenCalledTimes(1);

    clearDelegatedEvents();
    button.dispatchEvent(new Event('click', { bubbles: true }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('handles event with data parameter', () => {
    delegateEvents(['click']);

    const button = document.createElement('button');
    const handler = vi.fn();
    const eventData = { value: 'test-data' };

    (button as any)._$click = handler;
    (button as any).clickData = eventData;
    document.body.appendChild(button);

    button.dispatchEvent(new Event('click', { bubbles: true }));
    expect(handler).toHaveBeenCalledWith(eventData, expect.any(Event));
  });

  it('stops propagation when cancelBubble is set', () => {
    delegateEvents(['click']);

    const container = document.createElement('div');
    const button = document.createElement('button');
    const buttonHandler = vi.fn((e: Event) => {
      e.cancelBubble = true;
    });
    const containerHandler = vi.fn();

    (button as any)._$click = buttonHandler;
    (container as any)._$click = containerHandler;
    container.appendChild(button);
    document.body.appendChild(container);

    button.dispatchEvent(new Event('click', { bubbles: true }));
    expect(buttonHandler).toHaveBeenCalledTimes(1);
    expect(containerHandler).not.toHaveBeenCalled();
  });

  it('skips disabled elements', () => {
    delegateEvents(['click']);

    const button = document.createElement('button');
    const handler = vi.fn();

    (button as any)._$click = handler;
    (button as any).disabled = true;
    document.body.appendChild(button);

    button.dispatchEvent(new Event('click', { bubbles: true }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('handles host element retargeting', () => {
    delegateEvents(['click']);

    const button = document.createElement('button');
    const handler = vi.fn();

    (button as any)._$click = handler;
    document.body.appendChild(button);

    button.dispatchEvent(new Event('click', { bubbles: true }));
    expect(handler).toHaveBeenCalled();
  });

  it('handles portal with _$host property', () => {
    delegateEvents(['click']);

    const portalMount = document.createElement('div');
    const portalContent = document.createElement('div');
    const button = document.createElement('button');
    const mountHandler = vi.fn();

    // Simulate portal structure
    (portalContent as any)._$host = portalMount;
    (button as any)._$click = vi.fn();
    (portalMount as any)._$click = mountHandler;

    portalContent.appendChild(button);
    document.body.appendChild(portalMount);
    document.body.appendChild(portalContent);

    // Create event with composedPath
    const event = new Event('click', { bubbles: true, composed: true });
    Object.defineProperty(event, 'composedPath', {
      value: () => [button, portalContent, document.body, document.documentElement, document],
    });

    button.dispatchEvent(event);
    expect(mountHandler).toHaveBeenCalled();
  });

  it('stops at root of event delegation', () => {
    delegateEvents(['click']);

    const root = document.createElement('div');
    const container = document.createElement('div');
    const button = document.createElement('button');
    const rootHandler = vi.fn();
    const containerHandler = vi.fn();

    (button as any)._$click = vi.fn();
    (container as any)._$click = containerHandler;
    (root as any)._$click = rootHandler;

    container.appendChild(button);
    root.appendChild(container);
    document.body.appendChild(root);

    // Create event with composedPath where root is the currentTarget
    const event = new Event('click', { bubbles: true, composed: true });
    Object.defineProperty(event, 'currentTarget', {
      value: root,
      configurable: true,
    });
    Object.defineProperty(event, 'composedPath', {
      value: () => [button, container, root, document.body],
    });

    button.dispatchEvent(event);
    expect(containerHandler).toHaveBeenCalled();
  });

  it('uses walkUpTree fallback when composedPath is not available', () => {
    delegateEvents(['click']);

    const container = document.createElement('div');
    const button = document.createElement('button');
    const buttonHandler = vi.fn();
    const containerHandler = vi.fn();

    (button as any)._$click = buttonHandler;
    (container as any)._$click = containerHandler;
    container.appendChild(button);
    document.body.appendChild(container);

    // Create event without composedPath
    const event = new Event('click', { bubbles: true });
    Object.defineProperty(event, 'composedPath', {
      value: undefined,
    });

    button.dispatchEvent(event);
    expect(buttonHandler).toHaveBeenCalledTimes(1);
    expect(containerHandler).toHaveBeenCalledTimes(1);
  });

  it('handles currentTarget getter', () => {
    delegateEvents(['click']);

    const button = document.createElement('button');
    let capturedCurrentTarget: any;
    const handler = vi.fn((e: Event) => {
      capturedCurrentTarget = e.currentTarget;
    });

    (button as any)._$click = handler;
    document.body.appendChild(button);

    button.dispatchEvent(new Event('click', { bubbles: true }));
    expect(capturedCurrentTarget).toBe(button);
  });

  it('does not add duplicate event listeners', () => {
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

    delegateEvents(['click']);
    delegateEvents(['click']);

    expect(addEventListenerSpy).toHaveBeenCalledTimes(1);
    addEventListenerSpy.mockRestore();
  });

  it('handles multiple event types', () => {
    delegateEvents(['click', 'input', 'change']);

    const button = document.createElement('button');
    const clickHandler = vi.fn();
    const inputHandler = vi.fn();

    (button as any)._$click = clickHandler;
    (button as any)._$input = inputHandler;
    document.body.appendChild(button);

    button.dispatchEvent(new Event('click', { bubbles: true }));
    button.dispatchEvent(new Event('input', { bubbles: true }));

    expect(clickHandler).toHaveBeenCalledTimes(1);
    expect(inputHandler).toHaveBeenCalledTimes(1);
  });

  it('clears all delegated events', () => {
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

    delegateEvents(['click', 'input']);
    clearDelegatedEvents();

    expect(removeEventListenerSpy).toHaveBeenCalledTimes(2);
    removeEventListenerSpy.mockRestore();
  });

  it('handles clearDelegatedEvents when no events are registered', () => {
    expect(() => clearDelegatedEvents()).not.toThrow();
  });

  it('handles non-function handlers gracefully', () => {
    delegateEvents(['click']);

    const button = document.createElement('button');
    (button as any)._$click = 'not-a-function';
    document.body.appendChild(button);

    expect(() => {
      button.dispatchEvent(new Event('click', { bubbles: true }));
    }).not.toThrow();
  });

  it('handles events on elements without handlers', () => {
    delegateEvents(['click']);

    const button = document.createElement('button');
    document.body.appendChild(button);

    expect(() => {
      button.dispatchEvent(new Event('click', { bubbles: true }));
    }).not.toThrow();
  });
});
