import { renderTemplate, renderToString, ssgRender } from '../src';

describe('service', () => {
  let App;
  let root;
  const _tmpl$ = ['<div', '>', 'Hello, ', '!', '</div>'];

  beforeEach(() => {
    root = document.createElement('div');
    function AppFn(props) {
      const name = 'John';

      return renderTemplate(_tmpl$, {
        '1': {
          id: props.id,
          class: props.class,
          children: [[() => name, 2]],
        },
      });
    }
    App = AppFn;
  });

  afterEach(() => {
    App = null;
    root = null;
  });

  it('should render a template with props', () => {
    const props = {
      id: 'test',
      class: 'test-class',
    };
    const result = renderTemplate(App, props);
    expect(result).toMatchInlineSnapshot(`"<div id="test" class="test-class">JohnHello, !</div>"`);
  });

  it('should render a component to a string', () => {
    const props = {
      id: 'test',
      class: 'test-class',
    };
    const result = renderToString(App, props);
    expect(result).toMatchInlineSnapshot(`"<div id="test" class="test-class">JohnHello, !</div>"`);
  });
  it('should work with ssgRender', () => {
    const props = {
      id: 'test',
      class: 'test-class',
    };
    ssgRender(App, root, props);
    expect(root.innerHTML).toMatchInlineSnapshot(
      `"<div id="test" class="test-class">JohnHello, !</div>"`,
    );
  });
});
