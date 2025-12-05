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
});
