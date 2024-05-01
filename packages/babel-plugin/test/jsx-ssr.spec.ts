import { getTransform } from './transform-util';
const transformCode = getTransform('jsx', { ssr: true });
describe('jsx ssr transform', () => {
  it('transforms simple JSX element', () => {
    const inputCode = `
      const element = <div>Hello World</div>;
    `;

    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('transforms JSX element with attributes', () => {
    const inputCode = `
      const element = <div id="myId" class="myClass">Hello World</div>;
    `;

    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('transforms JSX element with dynamic expressions', () => {
    const inputCode = `
      const name = 'John';
      const element = <div>Hello, {name}!</div>;
    `;

    // TODO: bug
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('transforms JSX element with boolean attribute', () => {
    const inputCode = `
      const element = <input disabled />;
    `;

    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('transforms JSX element with spread attributes', () => {
    const inputCode = `
      const props = { id: 'myId', class: 'myClass' };
      const element = <div {...props}>Hello World</div>;
    `;

    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('transforms JSX element with conditional attributes', () => {
    const inputCode = `
      const hasClass = true;
      const element = <div class={hasClass ? 'myClass' : 'otherClass'}>Hello World</div>;
    `;

    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('transforms JSX element with style attribute', () => {
    const inputCode = `
      const style = { color: 'red', fontSize: '16px' };
      const element = <div style={style}>Hello World</div>;
    `;

    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('transforms JSX element with class and style attributes', () => {
    const inputCode = `
      const hasClass = true;
      const style = { color: 'red', fontSize: '16px' };
      const element = <div class={hasClass ? 'myClass' : ''} style={style}>Hello World</div>;
    `;

    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('transforms JSX element with children', () => {
    const inputCode = `
      const element = (
        <div>
          <p>Paragraph 1</p>
          <p>Paragraph 2</p>
        </div>
      );
    `;

    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('transforms JSX element with nested expressions and children', () => {
    const inputCode = `
      const name = 'John';
      const element = (
        <div>
          <p>{name}'s Profile</p>
          <ul>
            {Array.from({ length: 3 }, (_, i) => (
              <li key={i}>Item {i + 1}</li>
            ))}
          </ul>
        </div>
      );
    `;

    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('transforms JSX element with null and undefined attributes', () => {
    const inputCode = `
      const element = <div id={null} class={undefined}>Hello World</div>;
    `;

    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('transforms JSX element with null and undefined children', () => {
    const inputCode = `
      const element = (
        <div>
          {null}
          <p>Paragraph 1</p>
          {undefined}
          {false}
          <p>Paragraph 2</p>
        </div>
      );
    `;

    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('transforms JSX element with null and undefined in expressions', () => {
    const inputCode = `
      const name = null;
      const element = (
        <div>
          <p>{name}'s Profile</p>
          {undefined}
          <p>Paragraph 2</p>
        </div>
      );
    `;

    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('transforms JSX element with JSX fragment', () => {
    const inputCode = `
      const element = (
        <>
          <p>Paragraph 1</p>
          <p>Paragraph 2</p>
        </>
      );
    `;

    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('transforms JSX element with JSX fragment as children', () => {
    const inputCode = `
      const element = (
        <div>
          <>
            <p>Paragraph 1</p>
            <p>Paragraph 2</p>
          </>
        </div>
      );
    `;

    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('transforms JSX element with function components', () => {
    const inputCode = `
      const element = (
        <div>
          <MyComponent text="Component 1" />
          <MyComponent text="Component 2" />
        </div>
      );
    `;

    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('transforms JSX element with self-closing tags', () => {
    const inputCode = `
      const element = (
        <div>
          <img src="image.jpg" alt="Image 1" />
          <img src="image.jpg" alt="Image 2" />
        </div>
      );
    `;

    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('transforms JSX element with SVG tags', () => {
    const inputCode = `
      const element = (
        <svg>
          <circle cx="50" cy="50" r="40" stroke="black" stroke-width="3" fill="red" />
        </svg>
      );
    `;

    expect(transformCode(inputCode)).toMatchSnapshot();
  });
});
