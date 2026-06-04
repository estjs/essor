import { getTransform } from './transform';
const transformCode = getTransform('props', { hmr: false });
describe('jsx props transform', () => {
  it('should replace function parameter with "props"', () => {
    const input = `
      function testFunction({ prop1, prop2 }) {
        return <div prop1={prop1} prop2={prop2} />;
      }
    `;

    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should work with rest pattern props', () => {
    const input = `
      function testFunction({ prop1, prop2, ...restProps }) {
        return <div prop1={prop1} prop2={prop2} {...restProps} />;
      }
    `;

    const code = transformCode(input);
    expect(code).toMatchSnapshot();
  });

  it('should work with rest value props', () => {
    const input = `
      function testFunction({ prop1, prop2, ...restProps }) {
        return <div prop1={prop1} prop2={prop2} rest={{...restProps}} />;
      }
    `;

    const code = transformCode(input);
    expect(code).toMatchSnapshot();
  });

  it('should work with deep props', () => {
    const input = `
      function testFunction({ prop1: { prop2: { prop3: {prop4 ,prop5}} } }) {
        return <div prop4={prop4} prop5={prop5}/>;
      }
    `;

    const code = transformCode(input);

    expect(code).toMatchSnapshot();
  });

  it("should replace function parameter with 'props' when it's an object", () => {
    const input = `
      function testFunction({ prop1, prop2 },otherProps) {
        return <div prop1={prop1} prop2={prop2} >{otherProps}</div>;
      }
    `;

    const code = transformCode(input);
    expect(code).toMatchSnapshot();
  });
  it('should not work with array props', () => {
    const input = `
      function testFunction([prop1, prop2],otherProps) {
        return <div prop1={prop1} prop2={prop2} >{otherProps}</div>;
      }
    `;

    const code = transformCode(input);
    expect(code).toMatchSnapshot();
  });
  it('should not work with not pattern props', () => {
    const input = `
      function testFunction(prop1, prop2) {
        return <div prop1={prop1} prop2={prop2} />;
      }
    `;

    const code = transformCode(input);
    expect(code).toMatchSnapshot();
  });
  it('should work just rest props', () => {
    const input = `
      function testFunction({ ...restProps}) {
        return <div prop1={restProps.$prop1} prop2={restProps.prop2} rest={{
          ...restProps
        }} />;
      }
    `;

    const code = transformCode(input);
    expect(code).toMatchSnapshot();
  });

  it('should work with computed property names', () => {
    const input = `
      function testFunction({ [computedProp]: value }) {
        return <div prop={value} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should work with default values', () => {
    const input = `
      function testFunction({ prop1 = 'default1', prop2 = 42 }) {
        return <div prop1={prop1} prop2={prop2} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should work with nested destructuring and defaults', () => {
    const input = `
      function testFunction({ user: { name = 'John', age = 25 } = {} }) {
        return <div name={name} age={age} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should work with array destructuring in object pattern', () => {
    const input = `
      function testFunction({ items: [first, second] }) {
        return <div first={first} second={second} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should work with complex nested patterns', () => {
    const input = `
      function testFunction({
        user: {
          name,
          contacts: [primary = {}, ...others],
          settings: { theme = 'light', ...otherSettings } = {}
        }
      }) {
        return (
          <div
            name={name}
            primary={primary}
            others={others}
            theme={theme}
            settings={otherSettings}
          />
        );
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should work with function parameters', () => {
    const input = `
      function testFunction({ callback = () => {} }) {
        return <button onClick={callback}>Click me</button>;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should work with object method shorthand', () => {
    const input = `
      const obj = {
        method({ prop1, prop2 }) {
          return <div prop1={prop1} prop2={prop2} />;
        }
      };
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should work with class methods', () => {
    const input = `
      class TestClass {
        method({ prop1, prop2 }) {
          return <div prop1={prop1} prop2={prop2} />;
        }
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should work with arrow functions in class properties', () => {
    const input = `
      class TestClass {
        handler = ({ prop1, prop2 }) => {
          return <div prop1={prop1} prop2={prop2} />;
        };
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should work with multiple parameters including object pattern', () => {
    const input = `
      function testFunction(first, { prop1, prop2 }, last) {
        return <div first={first} prop1={prop1} prop2={prop2} last={last} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should work with nested function declarations', () => {
    const input = `
      function outer() {
        function inner({ prop1, prop2 }) {
          return <div prop1={prop1} prop2={prop2} />;
        }
        return inner;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should work with async functions', () => {
    const input = `
      async function testFunction({ prop1, prop2 }) {
        const result = await someAsyncOperation();
        return <div prop1={prop1} prop2={prop2} result={result} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should work with generator functions', () => {
    const input = `
      function* testFunction({ prop1, prop2 }) {
        yield <div prop1={prop1} />;
        yield <div prop2={prop2} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should work with async generator functions', () => {
    const input = `
      async function* testFunction({ prop1, prop2 }) {
      return <div prop2={prop2} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should work with nested function declarations with rest props', () => {
    const input = `
      function outer() {
        function inner({ prop1, prop2, ...restProps }) {
          return <div prop1={prop1} prop2={prop2} rest={{...restProps}} />;
        }
        return inner;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  // ── Default values of every container type ────────────────────────────────

  it('should keep a Set default value', () => {
    const input = `
      function testFunction({ tags = new Set([1, 2]) }) {
        return <div tags={tags} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should keep a Map default value', () => {
    const input = `
      function testFunction({ cache = new Map([['a', 1]]) }) {
        return <div cache={cache} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should keep an array default value', () => {
    const input = `
      function testFunction({ list = [1, 2, 3] }) {
        return <div list={list} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should keep an object default value', () => {
    const input = `
      function testFunction({ config = { theme: 'dark', nested: { a: 1 } } }) {
        return <div config={config} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  // ── Iterable destructuring (iterator protocol, not index access) ──────────

  it('should array-destructure an iterable (Set/Map/generator) via spread', () => {
    const input = `
      function testFunction({ items: [first, second] }) {
        return <div first={first} second={second} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should destructure Map entries via nested array pattern', () => {
    const input = `
      function testFunction({ entries: [[key, value]] }) {
        return <div key={key} value={value} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should destructure a string prop by character', () => {
    const input = `
      function testFunction({ name: [initial, ...restChars] }) {
        return <div initial={initial} rest={restChars} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should array-destructure with element defaults from an iterable', () => {
    const input = `
      function testFunction({ items: [first = 'a', second = 'b'] = [] }) {
        return <div first={first} second={second} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should handle nested array-in-array patterns', () => {
    const input = `
      function testFunction({ matrix: [[a, b], [c, d]] }) {
        return <div a={a} b={b} c={c} d={d} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should handle array of objects', () => {
    const input = `
      function testFunction({ list: [{ id, name }, { id: id2 }] }) {
        return <div id={id} name={name} id2={id2} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  // ── Deep structures with defaults at every level ──────────────────────────

  it('should resolve deep object structure with defaults at each level', () => {
    const input = `
      function testFunction({ a: { b: { c = 1 } = {} } = {} }) {
        return <div c={c} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should resolve deep structure with a container default at depth', () => {
    const input = `
      function testFunction({ config: { tags = new Set(), items = [] } = {} }) {
        return <div tags={tags} items={items} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should keep a deep object literal as a top-level default', () => {
    const input = `
      function testFunction({ user = { profile: { name: 'anon' } } }) {
        return <div user={user} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  // ── Aliases, literal keys, combined ───────────────────────────────────────

  it('should handle alias combined with default', () => {
    const input = `
      function testFunction({ a: renamed = 5 }) {
        return <div value={renamed} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should handle numeric and string-literal keys', () => {
    const input = `
      function testFunction({ 0: zero, 'data-id': dataId }) {
        return <div zero={zero} dataId={dataId} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should handle nested object rest at depth', () => {
    const input = `
      function testFunction({ user: { name, ...others } }) {
        return <div name={name} others={{ ...others }} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should handle a binding used at multiple sites', () => {
    const input = `
      function testFunction({ value = 0 }) {
        return <div a={value} b={value} c={value} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  // ── Defaults that reference sibling bindings ──────────────────────────────

  it('should resolve a default that references a sibling prop', () => {
    const input = `
      function testFunction({ id, key = id }) {
        return <div id={id} key={key} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should resolve a chain of sibling-referencing defaults', () => {
    const input = `
      function testFunction({ a = 1, b = a, c = b }) {
        return <div a={a} b={b} c={c} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should resolve a sibling reference inside a default expression', () => {
    const input = `
      function testFunction({ count = 0, label = 'n=' + count }) {
        return <div count={count} label={label} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should exclude a computed key from a sibling rest at runtime', () => {
    const input = `
      function testFunction({ [dynamicKey]: value, ...rest }) {
        return <div value={value} {...rest} />;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });
});
