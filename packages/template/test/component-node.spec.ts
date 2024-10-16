import { ComponentNode } from '../src/component-node';
import { h, template } from '../src';

describe('componentNode', () => {
  it('should handle get firstChild', () => {
    const tmpl = template('<div>Test</div>');
    const node = new ComponentNode(() => h(tmpl, {}));
    node.mount(document.createElement('div'));
    expect(node.firstChild).toBeTruthy();
  });

  it('should handle get isConnected', () => {
    const tmpl = template('<div>Test</div>');
    const node = new ComponentNode(() => h(tmpl, {}));
    expect(node.isConnected).toBe(false);
    node.mount(document.createElement('div'));
    expect(node.isConnected).toBe(true);
  });

  it('should handle inheritNode', () => {
    const tmpl = template('<div>Test</div>');
    const node1 = new ComponentNode(() => h(tmpl, {}));
    const node2 = new ComponentNode(() => h(tmpl, {}));
    node1.mount(document.createElement('div'));
    node2.inheritNode(node1);
    expect(node2.isConnected).toBe(true);
  });

  it('should handle patchProps with event listeners', () => {
    const tmpl = template('<button>Click me</button>');
    const onClick = vitest.fn();
    const node = new ComponentNode(() => h(tmpl, {}));
    const parent = document.createElement('div');
    node.mount(parent);
    node.patchProps({ onClick });
    parent.querySelector('button')?.click();
    expect(onClick).toHaveBeenCalled();
  });
});
