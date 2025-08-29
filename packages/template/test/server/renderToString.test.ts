import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { endHydration, startHydration } from '../../src/server/shared';
import { createSSGComponent, render, renderToString } from '../../src';
import type { Component } from '../../src/types';
import type { MockInstance } from 'vitest';

describe('server/renderToString module', () => {
  // Helper function to create a simple component
  const createMockComponent = (html = '<div>Test</div>', attrs = {}): Component => {
    return {
      html,
      attrs,
      children: [],
      renderedNode: null,
      componentContext: {},
      parentNode: null,
      beforeNode: null,
      afterNode: null,
      isMounted: false,
      isActive: true,
      isConnected: false,
      hooks: [],
      cleanup: [],
      placeholderText: null,
      nodes: [],
    };
  };

  beforeEach(() => {
    // Mock document.createElement with a type assertion
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = {
        tagName: tagName.toUpperCase(),
        attributes: {},
        children: [],
        innerHTML: '',
        appendChild: vi.fn(function (this: any, child: any) {
          this.children.push(child);
          return child;
        }),
        setAttribute: vi.fn(function (this: any, name: string, value: string) {
          this.attributes[name] = value;
        }),
        getAttribute: vi.fn(function (this: any, name: string) {
          return this.attributes[name];
        }),
        hasAttribute: vi.fn(function (this: any, name: string) {
          return name in this.attributes;
        }),
        removeAttribute: vi.fn(function (this: any, name: string) {
          delete this.attributes[name];
        }),
      };
      return element as unknown as HTMLElement;
    });

    // End any existing hydration to avoid test interference
    endHydration();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('renderToString function', () => {
    it('should render a simple component to string', () => {
      // Setup a simple component
      const component = createMockComponent('<div>Hello World</div>');

      // Call function under test
      const result = renderToString(component);

      // Verify output
      expect(result).toBe('<div>Hello World</div>');
    });

    it('should add hydration key when in hydration mode', () => {
      // Setup hydration mode
      startHydration();

      // Setup a simple component
      const component = createMockComponent('<div>Hydrated Component</div>');

      // Call function under test
      const result = renderToString(component);

      // Verify hydration key was added (data-hk="1")
      expect(result).toContain('data-hk="1"');
      expect(result).toContain('Hydrated Component');

      // Clean up
      endHydration();
    });

    it('should include script for hydration when hydratable is true', () => {
      // Setup a component
      const component = createMockComponent('<div>Hydratable Component</div>');

      // Call function under test with hydratable option
      const result = renderToString(component, { hydratable: true });

      // Verify hydration script was added
      expect(result).toContain('data-est-root');
      expect(result).toContain(
        `document.currentScript.parentElement.dispatchEvent(new Event('${HYDRATE_EVENT}'))`,
      );
    });

    it('should handle components with reactive properties', () => {
      // Setup a signal
      const counter = { peek: () => '42', toString: () => '42', subscribe: vi.fn() };

      // Setup a component with reactive property
      const component = createMockComponent('<div>Count: {count}</div>', { count: counter });

      // Call function under test
      const result = renderToString(component);

      // Verify output - signal should be stringified
      expect(result).toContain('Count: 42');
    });

    it('should handle components with nested children', () => {
      // Setup nested components
      const childComponent = createMockComponent('<span>Child</span>');
      const parentComponent = {
        ...createMockComponent('<div>{0}</div>'),
        children: [childComponent],
      };

      // Call function under test
      const result = renderToString(parentComponent);

      // Verify output with correct nesting
      expect(result).toBe('<div><span>Child</span></div>');
    });
  });

  describe('render function', () => {
    it('should render component and return HTML string', () => {
      // Mock renderToString for simplicity
      const renderToStringSpy = vi.spyOn(
        require('../../src/server/renderToString'),
        'renderToString',
      ) as MockInstance;
      renderToStringSpy.mockReturnValue('<div>Rendered Component</div>');

      // Create component function
      const componentFn = vi.fn();

      // Import render with mocked dependencies

      // Call function under test
      const result = render(componentFn);

      // Verify renderToString was called
      expect(renderToStringSpy).toHaveBeenCalled();
      expect(result).toBe('<div>Rendered Component</div>');
    });

    it('should pass props to component creation', () => {
      // Mock createComponent and renderToString
      const mockComponent = createMockComponent('<div>Component with Props</div>');
      const createComponentMock = vi.fn().mockReturnValue(mockComponent);

      vi.mock('../../src/component', () => ({
        createComponent: createComponentMock,
      }));

      const renderToStringSpy = vi.spyOn(
        require('../../src/server/renderToString'),
        'renderToString',
      ) as MockInstance;
      renderToStringSpy.mockReturnValue('<div>Component with Props</div>');

      // Create component function and props
      const componentFn = vi.fn();
      const props = { name: 'Test', id: 123 };

      // Import render with mocked dependencies

      // Call function under test
      render(componentFn, props);

      // Verify createComponent was called with props
      expect(createComponentMock).toHaveBeenCalledWith(componentFn, props);
    });

    it('should pass options to renderToString', () => {
      // Mock renderToString for verification
      const renderToStringSpy = vi.spyOn(
        require('../../src/server/renderToString'),
        'renderToString',
      ) as MockInstance;
      renderToStringSpy.mockReturnValue('<div>Component with Options</div>');

      // Create component function
      const componentFn = vi.fn();

      // Options to pass
      const options = { hydratable: true };

      // Call function under test
      render(componentFn, {}, options);

      // Verify options were passed to renderToString
      expect(renderToStringSpy).toHaveBeenCalledWith(expect.anything(), options);
    });
  });

  describe('createSSGComponent function', () => {
    it('should create a component with provided HTML', () => {
      // Call function under test
      const component = createSSGComponent('<p>SSG Component</p>');

      // Verify component structure
      expect(component).toHaveProperty('html');
      expect(component).toHaveProperty('attrs');
      expect(component).toHaveProperty('children');
      expect(component.html).toBe('<p>SSG Component</p>');
    });

    it('should handle components with placeholders', () => {
      // Call function under test with placeholders
      const component = createSSGComponent('<div>{0} and {1}</div>', 'First', 'Second');

      // Verify placeholders are included in children
      expect(component.children.length).toBe(2);
      expect(component.children[0]).toBe('First');
      expect(component.children[1]).toBe('Second');
    });

    it('should handle non-string children correctly', () => {
      // Create various child types
      const numberChild = 42;
      const booleanChild = true;
      const signalChild = {
        peek: () => 'Signal Value',
        toString: () => 'Signal Value',
        subscribe: vi.fn(),
      };
      const nullChild = null;

      // Call function under test with different child types
      const component = createSSGComponent(
        '<div>{0}{1}{2}{3}</div>',
        numberChild,
        booleanChild,
        signalChild,
        nullChild,
      );

      // Verify children are preserved correctly
      expect(component.children.length).toBe(4);
      expect(component.children[0]).toBe(numberChild);
      expect(component.children[1]).toBe(booleanChild);
      expect(component.children[2]).toBe(signalChild);
      expect(component.children[3]).toBe(nullChild);
    });
  });
});
