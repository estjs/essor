import { signal } from '@estjs/signal';
import {
  Component,
  type ComponentProps,
  componentEffect,
  createComponent,
  isComponent,
} from '../src/component';
import { createContext, setActiveContext } from '../src/context';
import { REF_KEY } from '../src/constants';

describe('component Module', () => {
  // Basic component function and nodes
  let componentFn: (props: ComponentProps) => Node;
  let renderedNode: HTMLDivElement;
  let parentNode: HTMLDivElement;
  let consoleErrorSpy: any;

  // Reset before each test
  beforeEach(() => {
    // Create a basic component function
    renderedNode = document.createElement('div');
    renderedNode.textContent = 'Test Component';
    componentFn = vi.fn().mockReturnValue(renderedNode);

    // Create parent node
    parentNode = document.createElement('div');

    // Spy on console.error for specific tests
    consoleErrorSpy = vi.spyOn(console, 'error');

    // Clear all mock call records
    vi.clearAllMocks();
  });

  // Clean up after each test
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('component class', () => {
    describe('constructor', () => {
      it('should initialize component with provided key', () => {
        const props = { key: 'custom-key', value: 'test' };
        const component = new Component(componentFn, props);

        expect(component.key).toBe('custom-key');
        expect(component.props).toBe(props);
      });

      it('should generate a key if key not provided', () => {
        const props = { value: 'test' };
        const component = new Component(componentFn, props);

        // Just check that key exists and is valid
        expect(component.key).toBeDefined();
        expect(component.props).toBe(props);
      });

      it('should create reactive props', () => {
        const props = { value: 'test' };
        const component = new Component(componentFn, props);

        // Verify props object is saved
        expect(component.props).toBe(props);
      });

      it('should handle empty props', () => {
        const component = new Component(componentFn);

        expect(component.props).toBeUndefined();
      });
    });

    describe('mount method', () => {
      it('should render component and insert node', () => {
        const component = new Component(componentFn);

        const result = component.mount(parentNode);

        // Verify component was rendered
        expect(componentFn).toHaveBeenCalled();

        // Verify node was inserted into parent
        expect(parentNode.contains(renderedNode)).toBe(true);

        // Verify component's internal state
        expect(component.renderedNode).toBe(renderedNode);
        expect(component.parentNode).toBe(parentNode);
        expect(component.isMounted).toBe(true);

        // Verify return value
        expect(result).toBe(renderedNode);
      });

      it('should reinsert without re-rendering if component already has rendered node', () => {
        const component = new Component(componentFn);
        component.renderedNode = renderedNode;

        component.mount(parentNode);

        // Component function should not be called again
        expect(componentFn).not.toHaveBeenCalled();

        // Node should be inserted
        expect(parentNode.contains(renderedNode)).toBe(true);
      });

      it('should handle beforeNode parameter', () => {
        const beforeNode = document.createElement('span');
        parentNode.appendChild(beforeNode);
        const component = new Component(componentFn);

        component.mount(parentNode, beforeNode);

        expect(component.beforeNode).toBe(beforeNode);
        // Verify the node is inserted before the reference node
        const children = Array.from(parentNode.childNodes);
        const renderedNodeIndex = children.indexOf(renderedNode);
        const beforeNodeIndex = children.indexOf(beforeNode);
        expect(renderedNodeIndex).toBeLessThan(beforeNodeIndex);
      });

      it('should create context and mark as mounted', () => {
        const component = new Component(componentFn);

        component.mount(parentNode);

        // Verify component is mounted
        expect(component.isMounted).toBe(true);
        expect(component.componentContext).toBeTruthy();
        expect(component.componentContext?.isMounted).toBe(true);
      });

      it('should apply props', () => {
        const props = { test: 'value' };
        const component = new Component(componentFn, props);
        const applyPropsSpy = vi.spyOn(component, 'applyProps');

        component.mount(parentNode);

        expect(applyPropsSpy).toHaveBeenCalledWith(props);
      });
    });

    describe('update method', () => {
      it('should remount component if keys are different', () => {
        // First mount the previous component so it has a valid parent node
        const previousComponent = new Component(componentFn, { key: 'prev-key' });
        previousComponent.mount(parentNode);

        // Reset spy counts
        vi.clearAllMocks();

        const component = new Component(componentFn, { key: 'new-key' });
        const mountSpy = vi.spyOn(component, 'mount');

        component.update(previousComponent);

        expect(mountSpy).toHaveBeenCalled();
      });

      it('should inherit properties from previous component', () => {
        // First mount the previous component
        const previousComponent = new Component(componentFn, { value: 'test' });
        previousComponent.mount(parentNode);

        const component = new Component(componentFn, { value: 'test', key: previousComponent.key });

        component.update(previousComponent);

        expect(component.parentNode).toBe(parentNode);
        expect(component.componentContext).toBe(previousComponent.componentContext);
        expect(component.renderedNode).toBe(renderedNode);
        expect(component.isMounted).toBe(true);
      });

      it('should mount component if not mounted and has parent node', () => {
        // First mount the previous component
        const previousComponent = new Component(componentFn);
        previousComponent.mount(parentNode);
        // Then manually set to not mounted
        previousComponent.isMounted = false;

        // Reset spy counts
        vi.clearAllMocks();

        const component = new Component(componentFn, { key: previousComponent.key });
        const mountSpy = vi.spyOn(component, 'mount');

        component.update(previousComponent);

        expect(mountSpy).toHaveBeenCalledWith(parentNode, previousComponent.beforeNode);
      });

      it('should apply props during update', () => {
        // First mount the previous component
        const previousComponent = new Component(componentFn);
        previousComponent.mount(parentNode);

        // Reset spy counts
        vi.clearAllMocks();

        const component = new Component(componentFn, { key: previousComponent.key });
        const applyPropsSpy = vi.spyOn(component, 'applyProps');

        component.update(previousComponent);

        expect(applyPropsSpy).toHaveBeenCalled();
      });
    });

    describe('destroy method', () => {
      it('should clean up component and remove nodes', () => {
        const component = new Component(componentFn);
        component.mount(parentNode);

        // Verify node is in parent before destroy
        expect(parentNode.contains(renderedNode)).toBe(true);

        component.destroy();

        // Verify node is removed
        expect(parentNode.contains(renderedNode)).toBe(false);

        // Verify internal state reset
        expect(component.renderedNode).toBeNull();
        expect(component.parentNode).toBeNull();
        expect(component.componentContext).toBeNull();
        expect(component.isMounted).toBe(false);
      });

      it('should do nothing if component context is already destroyed', () => {
        const component = new Component(componentFn);
        component.componentContext = null;

        // Should not throw errors
        expect(() => component.destroy()).not.toThrow();
      });
    });

    describe('applyProps method', () => {
      it('should do nothing if props are undefined', () => {
        const component = new Component(componentFn);
        component.mount(parentNode);

        // This should not throw an error
        expect(() => component.applyProps(undefined as any)).not.toThrow();
      });

      it('should set event listeners for onX props', () => {
        const component = new Component(componentFn);
        component.mount(parentNode);

        let eventFired = false;
        const clickHandler = () => {
          eventFired = true;
        };

        component.applyProps({ onClick: clickHandler });

        // Simulate a click event
        const event = new MouseEvent('click');
        renderedNode.dispatchEvent(event);

        expect(eventFired).toBe(true);
      });

      it('should handle ref prop with signal value', () => {
        const component = new Component(componentFn);
        component.mount(parentNode);

        const refSignal = signal(null);
        component.applyProps({ [REF_KEY]: refSignal });

        expect(refSignal.value).toStrictEqual(renderedNode);
      });

      it('should save props reference', () => {
        const component = new Component(componentFn);
        component.mount(parentNode);

        const props = { test: 'value' };
        component.applyProps(props);

        expect(component.props).toBe(props);
      });
    });
  });

  describe('isComponent function', () => {
    it('should return true for Component instances', () => {
      const component = new Component(componentFn);

      expect(isComponent(component)).toBe(true);
    });

    it('should return false for non-Component values', () => {
      const nonComponents = [
        null,
        undefined,
        'string',
        123,
        {},
        [],
        () => {},
        document.createElement('div'),
      ];

      nonComponents.forEach(value => {
        expect(isComponent(value)).toBe(false);
      });
    });
  });

  describe('createComponent function', () => {
    it('should create a new Component instance', () => {
      const props = { test: 'value' };
      const component = createComponent(componentFn, props);

      expect(component).toBeInstanceOf(Component);
      expect(component.component).toBe(componentFn);
      expect(component.props).toBe(props);
    });
  });

  describe('componentEffect function', () => {
    it('should add effect function to active context', () => {
      // Create and set a context
      const testContext = createContext();
      setActiveContext(testContext);

      const effectFn = () => {};
      componentEffect(effectFn);

      expect(testContext.componentEffect.has(effectFn)).toBe(true);

      // Clean up
      setActiveContext(null);
    });

    it('should log error if no active context', () => {
      // Ensure no active context
      setActiveContext(null);

      const effectFn = () => {};
      componentEffect(effectFn);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('No active context found'),
      );
    });
  });
});
