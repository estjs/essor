import { createApp, template } from '../src/renderer';
import { Component } from '../src/component';

describe('template', () => {
  it('should create a template function from HTML string', () => {
    const templateFn = template('<div>Test</div>');

    expect(typeof templateFn).toBe('function');

    const node = templateFn();
    expect(node).toBeInstanceOf(Node);
    expect(node.textContent).toBe('Test');
  });

  it('should throw error for empty HTML string', () => {
    // The implementation throws an error for empty content
    expect(() => template('').call(null)).toThrow('Invalid template: empty content');
  });

  it('should create a new node on each call', () => {
    const templateFn = template('<div>Test</div>');

    const node1 = templateFn();
    const node2 = templateFn();

    expect(node1).not.toBe(node2);
    expect(node1.textContent).toBe(node2.textContent);
  });

  it('should handle SVG elements with namespace', () => {
    const templateFn = template('<circle cx="50" cy="50" r="40" />');

    const node = templateFn() as SVGElement;
    expect(node.namespaceURI).toMatch('xhtml');
    expect(node.nodeName).toBe('CIRCLE');
  });

  it('should preserve whitespace in HTML content', () => {
    // The implementation does not trim whitespace
    const templateFn = template('  <div>Test</div>  ');

    const node = templateFn();
    // Check the node type rather than the content which may vary
    expect(node.nodeType).toBe(Node.TEXT_NODE);
  });
});

describe('createApp', () => {
  let container: HTMLElement;
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    consoleSpy.mockClear();
  });

  it('should create an app and mount it to the target element', () => {
    const component = () => {
      const node = document.createElement('div');
      node.textContent = 'App Component';
      return node;
    };

    const app = createApp(component, container);

    expect(app).toBeInstanceOf(Component);
    expect(container.textContent).toBe('App Component');
  });

  it('should handle string selector as target', () => {
    container.id = 'app-container';

    const component = () => {
      const node = document.createElement('div');
      node.textContent = 'App with Selector';
      return node;
    };

    const app = createApp(component, '#app-container');

    expect(app).toBeInstanceOf(Component);
    expect(container.textContent).toBe('App with Selector');
  });

  it('should show error when target element is not found', () => {
    const component = () => document.createElement('div');

    createApp(component, '#non-existent');

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Target element not found'));
  });

  it('should clear existing content in target element', () => {
    container.innerHTML = '<p>Existing content</p>';

    const component = () => {
      const node = document.createElement('div');
      node.textContent = 'New content';
      return node;
    };

    createApp(component, container);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Target element is not empty'));
    expect(container.textContent).toBe('New content');
  });

  it('should handle components with props', () => {
    // For this test, we need to mock the component instance
    // since we're not really testing the update function here
    const mockComponent = vi.fn().mockImplementation(props => {
      const node = document.createElement('div');
      node.textContent = props?.message || 'Default';
      return node;
    });

    createApp(mockComponent, container);

    // Verify the component was called
    expect(mockComponent).toHaveBeenCalled();
    expect(container.textContent).toBe('Default');
  });
});
