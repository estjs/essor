import { getTransform } from './transformUtil';
const transformCode = getTransform('props', { hmr: false });
describe('jsx props transform', () => {
  it('should replace function parameter with "props"', () => {
    const input = `
      function testFunction({ prop1, prop2 }) {
        return <div prop1={prop1} prop2={prop2} />;
      }
    `;

    const code = transformCode(input);
    expect(code).toMatchSnapshot();
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
        yield await <div prop1={prop1} />;
        yield await <div prop2={prop2} />;
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
});
