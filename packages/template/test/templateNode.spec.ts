import { h } from '../src/jsxRenderer';
import { mount } from './testUtils';

describe('templateNode', () => {
  let parent: HTMLElement;
  let app;

  beforeEach(async () => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    const App = await import('./snippet/Basic');
    app = mount(App.default, parent);
  });

  afterEach(() => {
    document.body.removeChild(parent);
  });

  it('should mount and unmount correctly', () => {
    const template = document.createElement('template');
    template.innerHTML = '<div>Test</div>';
    const node = h(template);

    node.mount(parent);
    expect(parent.innerHTML).toBe('<div>Test</div>');

    node.unmount();
    expect(parent.innerHTML).toBe('');
  });

  it('should patch props correctly', () => {
    const template = document.createElement('template');
    template.innerHTML = '<div></div>';
    const node = h(template);
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
    const node = h(template);
    node.mount(parent);

    //@ts-ignore
    node.patchProps({
      '1': {
        children: [['Child', null]],
      },
    });

    expect(parent.innerHTML).toBe('<div>Child</div>');
  });

  it('should handle inheritNode', () => {
    const template1 = document.createElement('template');
    template1.innerHTML = '<div>Original</div>';
    const node1 = h(template1);
    node1.mount(parent);

    const template2 = document.createElement('template');
    template2.innerHTML = '<div>New</div>';
    const node2 = h(template2);

    node2.inheritNode(node1);
    expect(parent.innerHTML).toBe('<div>Original</div>');
  });

  it('should work with conditional expression', () => {
    expect(app.get('p')?.innerHTML).toBe('Hello, World!');
    expect(app.get('p').style).toMatchInlineSnapshot(`
      CSSStyleDeclaration {
        "_importants": {
          "color": undefined,
          "font-size": undefined,
        },
        "_length": 0,
        "_onChange": [Function],
        "_setInProgress": false,
        "_values": {},
      }
    `);

    app.get('input').value = 'world';
    app.get('input').dispatchEvent(new Event('input'));
    expect(app.get('p')?.innerHTML).toBe('world');

    expect(app.get('p').style).toMatchInlineSnapshot(`
      CSSStyleDeclaration {
        "_importants": {
          "color": undefined,
          "font-size": undefined,
        },
        "_length": 0,
        "_onChange": [Function],
        "_setInProgress": false,
        "_values": {},
      }
    `);
  });
});
