import { hydrate, renderToString, ssr, ssrtmpl } from '../src';

describe('service', () => {
  let App;
  const _tmpl$ = ssrtmpl(['<div', '>', 'Hello, ', '!', '</div>']);

  beforeEach(() => {
    function AppFn(props) {
      const name = 'John';

      return ssr(_tmpl$, {
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
  });
  it('should return an empty object for empty templates array', () => {
    expect(ssrtmpl()).toEqual({});
  });

  it('should create a template map with correct indices', () => {
    const result = _tmpl$;
    expect(result).toMatchInlineSnapshot(`
      {
        "1": {
          "template": "<div",
        },
        "2": {
          "template": ">",
        },
        "3": {
          "template": "Hello, ",
        },
        "4": {
          "template": "!",
        },
        "5": {
          "template": "</div>",
        },
      }
    `);
  });

  it('should render a template with props', () => {
    const props = {
      id: 'test',
      class: 'test-class',
    };
    const result = ssr(App, props);
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
  it('should mount component to the root element', () => {
    document.body.innerHTML = '<div id="root"></div>';
    const component = {
      mount: vitest.fn(),
    };
    hydrate(component, document.querySelector('#root')!);
    expect(component.mount).toHaveBeenCalled();
  });
});
