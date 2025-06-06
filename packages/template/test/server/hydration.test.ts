import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { endHydration, isHydrating, startHydration } from '../../src/server/shared';
import { getRenderedElement, hydrate, mapSSRNodes } from '../../src';

describe('server/hydration module', () => {
  let originalCreateElement: typeof document.createElement;
  let originalQuerySelector: typeof document.querySelector;

  beforeEach(() => {
    // Store original methods
    originalCreateElement = document.createElement;
    originalQuerySelector = document.querySelector;

    // Reset DOM between tests
    document.body.innerHTML = '';

    // End hydration mode to avoid interference between tests
    endHydration();
  });

  afterEach(() => {
    // Restore original methods
    document.createElement = originalCreateElement;
    document.querySelector = originalQuerySelector;

    // Clean up
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  describe('getRenderedElement function', () => {
    it('should return existing element with matching hydration key', () => {
      // Setup
      startHydration();

      // Create an element with the hydration key
      const existingElement = document.createElement('div');
      existingElement.dataset.hk = '1';
      document.body.appendChild(existingElement);

      // Mock querySelector to return our element
      const querySelectorSpy = vi.spyOn(document, 'querySelector');
      querySelectorSpy.mockReturnValue(existingElement);

      // Call function under test
      const nextElementFn = getRenderedElement('<div>Fallback</div>');
      const result = nextElementFn();

      // Verify it found the existing element
      expect(querySelectorSpy).toHaveBeenCalledWith('[data-hk="1"]');
      expect(result).toBe(existingElement);

      // Clean up
      endHydration();
    });

    it('should create new element if no matching hydration key exists', () => {
      // Setup
      startHydration();

      // Mock querySelector to return null (no matching element)
      const querySelectorSpy = vi.spyOn(document, 'querySelector');
      querySelectorSpy.mockReturnValue(null);

      // We need to import template from renderer but it's complicated in the test
      // Let's create a minimal mock
      const mockTemplate = vi.fn().mockImplementation(() => {
        const div = document.createElement('div');
        div.textContent = 'Created Element';
        return () => div;
      });

      // Temporarily override the import
      vi.mock('../../src/renderer', () => ({
        template: mockTemplate,
      }));

      const nextElementFn = getRenderedElement('<div>Template</div>');
      const result = nextElementFn();

      // Verify it created a new element
      expect(querySelectorSpy).toHaveBeenCalledWith('[data-hk="1"]');
      expect(mockTemplate).toHaveBeenCalledWith('<div>Template</div>');
      expect(result).toBeDefined();
      expect(result.textContent).toBe('Created Element');

      // Clean up
      endHydration();
      vi.resetModules();
    });
  });

  describe('mapSSRNodes function', () => {
    it('should return normal node mapping when not hydrating', () => {
      // Create a template element with children
      const template = document.createElement('div');
      const child1 = document.createElement('span');
      const child2 = document.createElement('p');
      template.appendChild(child1);
      template.appendChild(child2);

      // Test mapSSRNodes in non-hydrating mode
      const result = mapSSRNodes(template, [1, 2]);

      // Should use mapNodes internally, which returns template as first element
      expect(result.length).toBe(3);
      expect(result[0]).toBe(template);
      expect(result[1]).toBe(child1);
      expect(result[2]).toBe(child2);
    });

    it('should map nodes by data-idx attributes when hydrating', () => {
      // Setup hydration mode
      startHydration();

      // Create a template with data-hk and children with data-idx
      const template = document.createElement('div');
      template.dataset.hk = '1';

      const child1 = document.createElement('span');
      child1.dataset.idx = '1-1';

      const child2 = document.createElement('p');
      child2.dataset.idx = '1-2';

      const child3 = document.createElement('div');
      child3.dataset.idx = '1-3';

      template.appendChild(child1);
      template.appendChild(child2);
      template.appendChild(child3);

      // Call function under test
      const result = mapSSRNodes(template, [1, 3]);

      // Should map nodes by data-idx
      expect(result.length).toBe(3);
      expect(result[0]).toBe(template);
      expect(result[1]).toBe(child1);
      expect(result[2]).toBe(child3);

      // Clean up
      endHydration();
    });

    it('should handle nested comment nodes with data-idx', () => {
      // Setup hydration mode
      startHydration();

      // Create template with data-hk
      const template = document.createElement('div');
      template.dataset.hk = '2';

      // Create a text node
      const textNode = document.createTextNode('Text content');
      template.appendChild(textNode);

      // Create a comment node with data-idx-like content
      const commentNode = document.createComment('2-5');
      template.appendChild(commentNode);

      // Call function under test
      const result = mapSSRNodes(template, [5]);

      // Should find the comment node
      expect(result.length).toBe(2);
      expect(result[0]).toBe(template);
      expect(result[1]).toBe(commentNode);

      // Clean up
      endHydration();
    });
  });

  describe('hydrate function', () => {
    it('should successfully hydrate a component in a container', () => {
      // Setup
      const rootElement = document.createElement('div');
      document.body.appendChild(rootElement);

      // Mock component function
      const componentFn = vi.fn().mockReturnValue(document.createElement('span'));

      // Mock createComponent to avoid full implementation
      const mockCreateComponent = vi.fn().mockReturnValue({
        mount: vi.fn(),
        component: componentFn,
      });

      vi.mock('../../src/component', () => ({
        createComponent: mockCreateComponent,
      }));

      // Define props
      const props = { test: 'value' };

      // Call function under test - need to reimport with mocks
      const result = hydrate(componentFn, rootElement, props);

      // Verify component was created and mounted
      expect(mockCreateComponent).toHaveBeenCalledWith(componentFn, props);
      expect(result.mount).toHaveBeenCalledWith(rootElement);

      // Should start and end hydration mode
      expect(isHydrating()).toBe(false);

      // Clean up
      vi.resetModules();
    });

    it('should handle string container selector', () => {
      // Setup
      const rootElement = document.createElement('div');
      rootElement.id = 'root';
      document.body.appendChild(rootElement);

      // Mock document.querySelector
      const querySelectorSpy = vi.spyOn(document, 'querySelector');
      querySelectorSpy.mockReturnValue(rootElement);

      // Mock component function
      const componentFn = vi.fn().mockReturnValue(document.createElement('span'));

      // Mock createComponent
      const mockCreateComponent = vi.fn().mockReturnValue({
        mount: vi.fn(),
        component: componentFn,
      });

      vi.mock('../../src/component', () => ({
        createComponent: mockCreateComponent,
      }));

      // Call function under test
      hydrate(componentFn, '#root');

      // Verify querySelector was called
      expect(querySelectorSpy).toHaveBeenCalledWith('#root');
      expect(mockCreateComponent).toHaveBeenCalled();

      // Clean up
      vi.resetModules();
    });

    it('should handle errors during hydration', () => {
      // Setup
      const rootElement = document.createElement('div');
      document.body.appendChild(rootElement);

      // Mock error function
      const errorSpy = vi.fn();

      vi.mock('@estjs/shared', () => ({
        error: errorSpy,
      }));

      // Mock component function that throws
      const componentFn = vi.fn();

      // Mock createComponent to throw error
      const mockCreateComponent = vi.fn().mockImplementation(() => {
        throw new Error('Hydration error');
      });

      vi.mock('../../src/component', () => ({
        createComponent: mockCreateComponent,
      }));

      // Call function under test
      const result = hydrate(componentFn, rootElement);

      // Verify error was logged and undefined was returned
      expect(errorSpy).toHaveBeenCalled();
      expect(result).toBeUndefined();

      // Should end hydration mode even if error occurs
      expect(isHydrating()).toBe(false);

      // Clean up
      vi.resetModules();
    });

    it('should handle missing container element', () => {
      // Mock document.querySelector to return null
      const querySelectorSpy = vi.spyOn(document, 'querySelector');
      querySelectorSpy.mockReturnValue(null);

      // Mock error function
      const errorSpy = vi.fn();

      vi.mock('@estjs/shared', () => ({
        error: errorSpy,
      }));

      // Mock component function
      const componentFn = vi.fn();

      // Call function under test
      const result = hydrate(componentFn, '#non-existent');

      // Verify error was logged and undefined was returned
      expect(errorSpy).toHaveBeenCalled();
      expect(result).toBeUndefined();

      // Clean up
      vi.resetModules();
    });
  });
});
