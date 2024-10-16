import { TemplateNode } from '../src/template-node';
import { h } from '../src/jsx-renderer';

describe('templateNode', () => {
  let parent: HTMLElement;

  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
  });

  afterEach(() => {
    document.body.removeChild(parent);
  });

  it('should create a TemplateNode instance', () => {
    const template = document.createElement('template');
    template.innerHTML = '<div>Test</div>';
    const node = new TemplateNode(template);
    expect(node).toBeInstanceOf(TemplateNode);
  });

  it('should mount and unmount correctly', () => {
    const template = document.createElement('template');
    template.innerHTML = '<div>Test</div>';
    const node = new TemplateNode(template);

    node.mount(parent);
    expect(parent.innerHTML).toBe('<div>Test</div>');

    node.unmount();
    expect(parent.innerHTML).toBe('');
  });

  it('should patch props correctly', () => {
    const template = document.createElement('template');
    template.innerHTML = '<div></div>';
    const node = new TemplateNode(template);
    node.mount(parent);
    //@ts-ignore
    node.patchProps({
      '1': {
        class: 'test-class',
        style: { color: 'red' },
        onClick: () => {},
      },
    });

    const div = parent.firstElementChild as HTMLElement;
    expect(div.className).toBe('test-class');
    expect(div.style.color).toBe('red');
  });

  it('should handle children prop', () => {
    const template = document.createElement('template');
    template.innerHTML = '<div></div>';
    const node = new TemplateNode(template);
    node.mount(parent);

    //@ts-ignore
    node.patchProps({
      '1': {
        children: [[h('span', { children: 'Child' }), null]],
      },
    });

    expect(parent.innerHTML).toBe('<div><span>Child</span></div>');
  });

  it('should handle inheritNode', () => {
    const template1 = document.createElement('template');
    template1.innerHTML = '<div>Original</div>';
    const node1 = new TemplateNode(template1);
    node1.mount(parent);

    const template2 = document.createElement('template');
    template2.innerHTML = '<div>New</div>';
    const node2 = new TemplateNode(template2);

    node2.inheritNode(node1);
    expect(parent.innerHTML).toBe('<div>Original</div>');
  });
});
