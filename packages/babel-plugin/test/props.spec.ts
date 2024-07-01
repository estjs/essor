import { getTransform } from './transform-util';
const transformCode = getTransform('props');
describe('props', () => {
  it('should replace function parameter with "props"', () => {
    const input = `
      function testFunction({ prop1, prop2 }) {
        return <div prop1={prop1} prop2={prop2} />;
      }
    `;

    const code = transformCode(input);
    expect(code).toMatchInlineSnapshot(`
      "function testFunction(__props) {
        return <div prop1={__props.prop1} prop2={__props.prop2} />;
      }"
    `);
  });

  it('should work with rest pattern props', () => {
    const input = `
      function testFunction({ prop1, prop2, ...restProps }) {
        return <div prop1={prop1} prop2={prop2} {...restProps} />;
      }
    `;

    const code = transformCode(input);
    expect(code).toMatchInlineSnapshot(`
      "import { useReactive as _reactive$ } from "essor";
      function testFunction(__props) {
        const restProps = _reactive$(__props, ["prop1", "prop2"]);
        return <div prop1={__props.prop1} prop2={__props.prop2} {...restProps} />;
      }"
    `);
  });

  it('should work with rest value props', () => {
    const input = `
      function testFunction({ prop1, prop2, ...restProps }) {
        return <div prop1={prop1} prop2={prop2} rest={{...restProps}} />;
      }
    `;

    const code = transformCode(input);
    expect(code).toMatchInlineSnapshot(`
      "import { useReactive as _reactive$ } from "essor";
      function testFunction(__props) {
        const restProps = _reactive$(__props, ["prop1", "prop2"]);
        return <div prop1={__props.prop1} prop2={__props.prop2} rest={{
          ...restProps
        }} />;
      }"
    `);
  });

  it('should work with deep props', () => {
    const input = `
      function testFunction({ prop1: { prop2: { prop3: {prop4 ,prop5}} } }) {
        return <div prop4={prop4} prop5={prop5}/>;
      }
    `;

    const code = transformCode(input);

    expect(code).toMatchInlineSnapshot(`
      "function testFunction(__props) {
        return <div prop4={__props.prop1.prop2.prop3.prop4} prop5={__props.prop1.prop2.prop3.prop5} />;
      }"
    `);
  });

  it("should replace function parameter with 'props' when it's an object", () => {
    const input = `
      function testFunction({ prop1, prop2 },otherProps) {
        return <div prop1={prop1} prop2={prop2} >{otherProps}</div>;
      }
    `;

    const code = transformCode(input);
    expect(code).toMatchInlineSnapshot(`
      "function testFunction(__props, otherProps) {
        return <div prop1={__props.prop1} prop2={__props.prop2}>{otherProps}</div>;
      }"
    `);
  });
  it('should not work with array props', () => {
    const input = `
      function testFunction([prop1, prop2],otherProps) {
        return <div prop1={prop1} prop2={prop2} >{otherProps}</div>;
      }
    `;

    const code = transformCode(input);
    expect(code).toMatchInlineSnapshot(`
      "function testFunction([prop1, prop2], otherProps) {
        return <div prop1={prop1} prop2={prop2}>{otherProps}</div>;
      }"
    `);
  });
  it('should not work with not pattern props', () => {
    const input = `
      function testFunction(prop1, prop2) {
        return <div prop1={prop1} prop2={prop2} />;
      }
    `;

    const code = transformCode(input);
    expect(code).toMatchInlineSnapshot(`
      "function testFunction(prop1, prop2) {
        return <div prop1={prop1} prop2={prop2} />;
      }"
    `);
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
    expect(code).toMatchInlineSnapshot(`
      "function testFunction(restProps) {
        return <div prop1={restProps.$prop1} prop2={restProps.prop2} rest={{
          ...restProps
        }} />;
      }"
    `);
  });
});
