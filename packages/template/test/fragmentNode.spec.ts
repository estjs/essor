import { template } from '../src';
import { FragmentNode } from '../src/fragmentNode';
import { mount } from './testUtils';

describe('fragmentNode', () => {
  let app;
  let app2;
  let fragmentNode;
  let parent;

  beforeEach(async () => {
    const FragmentRoot = await import('./snippet/Fragment');
    const FragmentAbbr = await import('./snippet/FragmentAbbr');
    app = mount(FragmentRoot.default);
    app2 = mount(FragmentAbbr.default);

    parent = document.createElement('div');
    const temp = template('<p></p><input type="text"/>');
    fragmentNode = new FragmentNode(temp);
  });

  afterEach(() => {
    app = null;
    app2 = null;
    fragmentNode = null;
    parent = null;
  });

  it('should work renderer fragment node', () => {
    expect(app.innerHTML()).toMatchInlineSnapshot(
      `"<p>component-1</p><div><h1>App1</h1></div><p>component-2</p><p>component-3</p><h1>App2</h1><p>component-4</p><p>component-5</p><p>component-6</p><h1>App3</h1><p>component-6</p><p>component-7</p><p>component-8</p><p>component-9</p><h1>App4</h1>"`,
    );
    expect(app2.innerHTML()).toMatchInlineSnapshot(
      `"<p>component-1</p><h1>App1</h1><!----><p>component-2</p><p>component-3</p><h1>App2</h1><!----><p>component-4</p><p>component-5</p><p>component-6</p><h1>App3</h1><!----><p>component-6</p><p>component-7</p><p>component-8</p><p>component-9</p><h1>App4</h1>"`,
    );
  });

  it('should mount correctly', () => {
    const nodes = fragmentNode.mount(parent);
    expect(nodes).toBeInstanceOf(Array);
    expect(nodes.length).toBe(2);
    expect(parent.childNodes.length).toBe(2);
  });

  it('should unmount correctly', () => {
    fragmentNode.mount(parent);
    expect(parent.childNodes.length).toBe(2);
    fragmentNode.unmount();
    expect(parent.childNodes.length).toBe(0);
  });

  it('should handle multiple mounts and unmounts', () => {
    fragmentNode.mount(parent);
    expect(parent.childNodes.length).toBe(2);
    fragmentNode.unmount();
    expect(parent.childNodes.length).toBe(0);

    fragmentNode.mount(parent);
    expect(parent.childNodes.length).toBe(2);
    fragmentNode.unmount();
    expect(parent.childNodes.length).toBe(0);
  });

  it('should maintain state between mounts', () => {
    const template = document.createElement('template');
    const childNode = document.createElement('div');
    template.content.appendChild(childNode);
    fragmentNode = new FragmentNode(template);

    fragmentNode.mount(parent);
    expect(parent.childNodes.length).toBe(1);
    expect(parent.firstChild).toStrictEqual(childNode);

    fragmentNode.unmount();
    expect(parent.childNodes.length).toBe(0);

    fragmentNode.mount(parent);
    expect(parent.childNodes.length).toBe(1);
    expect(parent.firstChild).toStrictEqual(childNode);
  });
});
