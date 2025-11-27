import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Fragment } from '../../src/components/Fragment';
import { mount } from '../testUtils';

describe('fragment component', () => {
  let container;

  beforeEach(() => {
    // Create test container
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Clean up DOM
    document.body.removeChild(container);
  });

  it('should render children elements without introducing extra DOM nodes', () => {
    // Render multiple child elements using Fragment
    const app = () => {
      return Fragment({
        children: [document.createElement('div'), document.createElement('span')],
      });
    };

    // Verify that there should be 2 child elements in the DOM, one div and one span
    mount(app, container);
    expect(container.children.length).toBe(2);
    expect(container.querySelector('div')).not.toBeNull();
    expect(container.querySelector('span')).not.toBeNull();
  });

  it('should handle empty children', () => {
    const app = () => {
      return Fragment({ children: null });
    };

    mount(app, container);

    expect(container.children.length).toBe(0);
  });

  it('should handle dynamic changes in children', async () => {
    let showContent = false;

    const getApp = () => {
      const children = showContent
        ? [document.createElement('div'), document.createElement('p')]
        : null;

      return Fragment({ children });
    };

    // Initial render
    mount(() => getApp(), container);

    // Initial state: no children
    expect(container.children.length).toBe(0);

    // Update state to show children
    showContent = true;

    // Re-render
    mount(() => getApp(), container);

    // Wait for DOM update
    await Promise.resolve();

    // Verify children are rendered
    expect(container.children.length).toBe(2);
    expect(container.querySelector('div')).not.toBeNull();
    expect(container.querySelector('p')).not.toBeNull();
  });

  it('should handle nested Fragments', () => {
    const app = () => {
      const innerFragment = Fragment({
        children: document.createElement('button'),
      });

      return Fragment({
        children: [document.createElement('h1'), innerFragment],
      });
    };

    mount(app, container);

    // Verify nested content is rendered correctly
    expect(container.querySelector('h1')).not.toBeNull();
    expect(container.querySelector('button')).not.toBeNull();
  });

  it('should work with text nodes', () => {
    const app = () => {
      return Fragment({
        children: [
          document.createTextNode('Hello'),
          document.createElement('span'),
          document.createTextNode('World'),
        ],
      });
    };

    mount(app, container);

    // Check text content
    expect(container.textContent).toBe('HelloWorld');
    expect(container.querySelector('span')).not.toBeNull();
  });
});
