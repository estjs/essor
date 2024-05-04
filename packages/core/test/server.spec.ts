import { hydrate, renderToString, ssr, ssrtmpl } from '../src';

describe('service', () => {
  let App;

  beforeEach(() => {
    const _tmpl$ = ssrtmpl(['<div>', 'Hello, ', '!', '</div>']);

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
    const templates = ['template1', 'template2', 'template3'];
    const result = ssrtmpl(templates);
    expect(result).toEqual({
      1: { template: 'template1' },
      2: { template: 'template2' },
      3: { template: 'template3' },
    });
  });

  it('should render a template with props', () => {
    const props = {
      id: 'test',
      class: 'test-class',
    };
    const result = ssr(App, props);
    expect(result).toMatchInlineSnapshot(
      `"[object Object] id=""test"" class=""test-class""Hello, John!</div>"`,
    );
  });

  it('should render a component to a string', () => {
    const props = {
      template1: {
        id: 'test',
        class: 'test-class',
      },
    };
    const result = renderToString(App, props);
    expect(result).toMatchInlineSnapshot(
      `"[object Object] id="undefined" class="undefined"Hello, John!</div>"`,
    );
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
