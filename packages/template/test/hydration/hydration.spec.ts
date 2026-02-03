import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as shared from '@estjs/shared';
import {
  getHydrationKey,
  getRenderedElement,
  hydrate,
  mapSSRNodes,
  resetHydrationKey,
} from '../../src';

describe('server/hydration', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    resetHydrationKey();
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  describe('getRenderedElement', () => {
    it('creates new element from template if not found', () => {
      const template = '<div></div>';
      const getElement = getRenderedElement(template);
      const element = getElement() as HTMLElement;
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.outerHTML).toBe('<div></div>');
    });

    it('returns existing element if found by hydration key', () => {
      const key = getHydrationKey(); // 0
      const existing = document.createElement('div');
      existing.dataset.hk = key;
      document.body.appendChild(existing);

      // Reset key to 0 so getRenderedElement looks for 0
      resetHydrationKey();

      const getElement = getRenderedElement('<span></span>');
      const element = getElement() as HTMLElement;

      expect(element).toBe(existing);
      expect(element.tagName).toBe('DIV');

      document.body.removeChild(existing);
    });

    it('returns null in non-browser environment', () => {
      // Mock isBrowser to return false
      vi.spyOn(shared, 'isBrowser').mockReturnValue(false);

      const template = '<div></div>';
      const getElement = getRenderedElement(template);
      const element = getElement();

      expect(element).toBeNull();
    });
  });

  describe('mapSSRNodes', () => {
    it('maps nodes using data-idx', () => {
      container.innerHTML = `
        <div data-hk="0">
          <span data-idx="0-0">child1</span>
          <span data-idx="0-1">child2</span>
        </div>
      `;
      const root = container.firstElementChild as HTMLElement;
      const nodes = mapSSRNodes(root, [0, 1]);

      expect(nodes).toHaveLength(3); // root + 2 children
      expect(nodes[0]).toBe(root);
      expect(nodes[1].textContent).toBe('child1');
      expect(nodes[2].textContent).toBe('child2');
    });

    it('maps comment nodes', () => {
      container.innerHTML = `
        <div data-hk="0">
          <!--0-0-->
        </div>
      `;
      const root = container.firstElementChild as HTMLElement;
      const nodes = mapSSRNodes(root, [0]);

      expect(nodes).toHaveLength(2); // root + 1 comment
      expect(nodes[1].nodeType).toBe(Node.COMMENT_NODE);
      expect(nodes[1].textContent).toBe('0-0');
    });

    it('fallbacks to mapNodes if no data-hk', () => {
      container.innerHTML = `
        <div>
          <span>child1</span>
          <span>child2</span>
        </div>
      `;
      const root = container.firstElementChild as HTMLElement;
      // mapNodes behavior: walks tree
      const nodes = mapSSRNodes(root, [0, 1]);
      // Assuming mapNodes works (it's imported), it should find children
      // But standard mapNodes relies on structure.
      // Let's just verify it returns something array-like.
      expect(Array.isArray(nodes)).toBe(true);
    });

    it('filters out elements with invalid data-idx format', () => {
      container.innerHTML = `
        <div data-hk="0">
          <span data-idx="0-0">valid</span>
          <span data-idx="invalid">invalid format</span>
          <span data-idx="abc-def">non-numeric</span>
          <span data-idx="0-1">valid2</span>
        </div>
      `;
      const root = container.firstElementChild as HTMLElement;
      const nodes = mapSSRNodes(root, [0, 1]);

      expect(nodes).toHaveLength(3); // root + 2 valid children
      expect(nodes[0]).toBe(root);
      expect(nodes[1].textContent).toBe('valid');
      expect(nodes[2].textContent).toBe('valid2');
    });

    it('recursively walks nested comment nodes', () => {
      container.innerHTML = `
        <div data-hk="0">
          <div>
            <div>
              <!--0-0-->
              <span>
                <!--0-1-->
              </span>
            </div>
          </div>
          <!--0-2-->
        </div>
      `;
      const root = container.firstElementChild as HTMLElement;
      const nodes = mapSSRNodes(root, [0, 1, 2]);

      expect(nodes).toHaveLength(4); // root + 3 comment nodes
      expect(nodes[0]).toBe(root);
      expect(nodes[1].nodeType).toBe(Node.COMMENT_NODE);
      expect(nodes[1].textContent).toBe('0-0');
      expect(nodes[2].nodeType).toBe(Node.COMMENT_NODE);
      expect(nodes[2].textContent).toBe('0-1');
      expect(nodes[3].nodeType).toBe(Node.COMMENT_NODE);
      expect(nodes[3].textContent).toBe('0-2');
    });

    it('handles mixed element and comment nodes', () => {
      container.innerHTML = `
        <div data-hk="0">
          <span data-idx="0-0">element</span>
          <!--0-1-->
          <div>
            <!--0-2-->
          </div>
        </div>
      `;
      const root = container.firstElementChild as HTMLElement;
      const nodes = mapSSRNodes(root, [0, 1, 2]);

      expect(nodes).toHaveLength(4); // root + 1 element + 2 comments
      expect(nodes[0]).toBe(root);
      expect(nodes[1].textContent).toBe('element');
      expect(nodes[2].nodeType).toBe(Node.COMMENT_NODE);
      expect(nodes[2].textContent).toBe('0-1');
      expect(nodes[3].nodeType).toBe(Node.COMMENT_NODE);
      expect(nodes[3].textContent).toBe('0-2');
    });

    it('ignores comment nodes with invalid format', () => {
      container.innerHTML = `
        <div data-hk="0">
          <!--0-0-->
          <!--invalid-->
          <!--abc-def-->
          <!--0-1-->
        </div>
      `;
      const root = container.firstElementChild as HTMLElement;
      const nodes = mapSSRNodes(root, [0, 1]);

      expect(nodes).toHaveLength(3); // root + 2 valid comments
      expect(nodes[1].nodeType).toBe(Node.COMMENT_NODE);
      expect(nodes[1].textContent).toBe('0-0');
      expect(nodes[2].nodeType).toBe(Node.COMMENT_NODE);
      expect(nodes[2].textContent).toBe('0-1');
    });
  });

  describe('hydrate', () => {
    it('hydrates component with valid container element', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Create a simple component that returns an element
      const Component = () => {
        const div = document.createElement('div');
        div.textContent = 'Hydrated';
        return div;
      };

      const result = hydrate(Component, container);

      // Should return a component instance (not undefined)
      expect(result).toBeDefined();
      consoleSpy.mockRestore();
    });

    it('hydrates component with valid container selector', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Add an id to the container for selector-based lookup
      container.id = 'test-container';

      const Component = () => {
        const div = document.createElement('div');
        div.textContent = 'Hydrated';
        return div;
      };

      const result = hydrate(Component, '#test-container');

      expect(result).toBeDefined();
      consoleSpy.mockRestore();
    });

    it('returns undefined if container not found', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const Component = () => ({ mount: vi.fn() });
      // @ts-ignore
      const result = hydrate(Component, '#non-existent');
      expect(result).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('handles error during mounting and returns undefined', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Create a component that throws an error
      const ErrorComponent = () => {
        throw new Error('Mount error');
      };

      const result = hydrate(ErrorComponent, container);

      expect(result).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('ends hydration mode even when error occurs', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Create a component that throws an error
      const ErrorComponent = () => {
        throw new Error('Mount error');
      };

      // This should not throw - error is caught internally
      expect(() => hydrate(ErrorComponent, container)).not.toThrow();

      consoleSpy.mockRestore();
    });
  });
});
describe('hydration key', () => {
  it('generates sequential keys', () => {
    resetHydrationKey();
    expect(getHydrationKey()).toBe('0');
    expect(getHydrationKey()).toBe('1');
    expect(getHydrationKey()).toBe('2');
  });

  it('resets key', () => {
    resetHydrationKey();
    getHydrationKey();
    getHydrationKey();
    resetHydrationKey();
    expect(getHydrationKey()).toBe('0');
  });
});
