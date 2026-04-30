import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Fragment, isFragment } from '../../src/components/Fragment';
import { mount } from '../test-utils';
import { createComponent } from '../../src';

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
      return createComponent(Fragment, {
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
      return createComponent(Fragment, { children: [] });
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

      return createComponent(Fragment, { children });
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
      const innerFragment = createComponent(Fragment, {
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
      return createComponent(Fragment, {
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

  it('should handle single child element', () => {
    const app = () => {
      return createComponent(Fragment, {
        children: document.createElement('p'),
      });
    };

    mount(app, container);

    expect(container.children.length).toBe(1);
    expect(container.querySelector('p')).not.toBeNull();
  });

  it('should handle single text node', () => {
    const app = () => {
      return createComponent(Fragment, {
        children: document.createTextNode('Single text'),
      });
    };

    mount(app, container);

    expect(container.textContent).toBe('Single text');
    expect(container.children.length).toBe(0); // Text nodes are not elements
  });

  it('should handle mixed content with null and undefined', () => {
    const app = () => {
      return createComponent(Fragment, {
        children: [
          document.createElement('div'),
          null,
          document.createElement('span'),
          undefined,
          document.createTextNode('text'),
        ],
      });
    };

    mount(app, container);

    // Only valid nodes should be rendered
    expect(container.children.length).toBe(2); // div and span
    expect(container.textContent).toBe('text');
  });

  it('should handle undefined children prop', () => {
    const app = () => {
      return createComponent(Fragment, {});
    };

    mount(app, container);

    expect(container.children.length).toBe(0);
  });

  it('should preserve element attributes', () => {
    const app = () => {
      const div = document.createElement('div');
      div.className = 'test-class';
      div.dataset.test = 'value';

      return createComponent(Fragment, {
        children: div,
      });
    };

    mount(app, container);

    const divElement = container.querySelector('div');
    expect(divElement).not.toBeNull();
    expect(divElement?.className).toBe('test-class');
    expect(divElement?.dataset.test).toBe('value');
  });

  it('should handle deeply nested Fragments', () => {
    const app = () => {
      const level3 = createComponent(Fragment, {
        children: document.createElement('span'),
      });

      const level2 = createComponent(Fragment, {
        children: [document.createElement('p'), level3],
      });

      const level1 = createComponent(Fragment, {
        children: [document.createElement('div'), level2],
      });

      return level1;
    };

    mount(app, container);

    (expect(container.querySelector('div')).toMatchInlineSnapshot(`<div />`),
      expect(container.querySelector('p')).toMatchInlineSnapshot(`<p />`));
    expect(container.querySelector('span')).toMatchInlineSnapshot(`<span />`);
  });

  it('should handle large number of children', () => {
    const app = () => {
      const children = Array.from({ length: 100 }, (_, i) => {
        const el = document.createElement('div');
        el.textContent = `Item ${i}`;
        return el;
      });

      return createComponent(Fragment, { children });
    };

    mount(app, container);

    expect(container.children.length).toBe(100);
    expect(container.firstElementChild?.textContent).toBe('Item 0');
    expect(container.lastElementChild?.textContent).toBe('Item 99');
  });

  it('should handle Fragment with key prop', () => {
    const app = () => {
      return createComponent(Fragment, {
        children: document.createElement('div'),
        key: 'test-key',
      });
    };

    mount(app, container);

    expect(container.children.length).toBe(1);
  });

  it('should have Fragment type marker', () => {
    expect(isFragment(Fragment)).toBe(true);
    expect(isFragment({})).toBe(false);
    expect(isFragment(null)).toBe(false);
    expect(isFragment(undefined)).toBe(false);
  });

  it('should handle empty array children', () => {
    const app = () => {
      return createComponent(Fragment, {
        children: [],
      });
    };

    mount(app, container);

    expect(container.children.length).toBe(0);
  });

  it('should handle mixed element types', () => {
    const app = () => {
      const div = document.createElement('div');
      const span = document.createElement('span');
      const button = document.createElement('button');
      const input = document.createElement('input');

      return createComponent(Fragment, {
        children: [div, span, button, input],
      });
    };

    mount(app, container);

    expect(container.querySelector('div')).not.toBeNull();
    expect(container.querySelector('span')).not.toBeNull();
    expect(container.querySelector('button')).not.toBeNull();
    expect(container.querySelector('input')).not.toBeNull();
  });

  it('should normalize primitive children', () => {
    const app = () => {
      // Fragment should handle primitive values through normalizeNode
      return createComponent(Fragment, {
        children: [
          document.createTextNode('Hello'),
          document.createTextNode(' '),
          document.createTextNode('World'),
        ],
      });
    };

    mount(app, container);

    expect(container.textContent).toBe('Hello World');
  });
});
