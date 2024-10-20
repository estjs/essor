import { useSignal } from '@estjs/signal';
import { TemplateNode } from '../src/templateNode';
import { h } from '../src/jsxRenderer';
import { template } from '../src';
import { mount } from './testUtils';

describe('templateNode', () => {
  let parent: HTMLElement;
  let app;

  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    const _tmpl$ = template('<div><p></p><input type="text"/>');
    function App() {
      const $v = useSignal('Hello, World!');

      return h(_tmpl$, {
        '2': {
          style: () => ({
            'color': $v.value === 'Hello, World!' ? 'green' : 'red',
            'font-size': $v.value === 'Hello, World!' ? '30px' : '12px',
          }),
          children: [[() => $v.value, null]],
        },
        '3': {
          value: $v,
          updateValue: _value => ($v.value = _value),
        },
      });
    }

    app = mount(App, parent);
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

  it('should work with conditional expression', () => {
    expect(app.get('p')?.innerHTML).toBe('Hello, World!');
    expect(app.get('p').style).toMatchInlineSnapshot(`
      CSSStyleDeclaration {
        "0": "color",
        "1": "font-size",
        "_importants": {
          "color": undefined,
          "font-size": undefined,
        },
        "_length": 2,
        "_onChange": [Function],
        "_setInProgress": false,
        "_values": {
          "color": "green",
          "font-size": "30px",
        },
      }
    `);

    app.get('input').value = 'world';
    app.get('input').dispatchEvent(new Event('input'));
    expect(app.get('p')?.innerHTML).toBe('world');

    expect(app.get('p').style).toMatchInlineSnapshot(`
      CSSStyleDeclaration {
        "0": "color",
        "1": "font-size",
        "_importants": {
          "color": undefined,
          "font-size": undefined,
        },
        "_length": 2,
        "_onChange": [Function],
        "_setInProgress": false,
        "_values": {
          "color": "red",
          "font-size": "12px",
        },
      }
    `);
  });
});
