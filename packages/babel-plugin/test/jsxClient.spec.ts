import { getTransform } from './util';
const transformCode = getTransform('jsx', { server: 'client', hmr: false });
describe('jsx transform', () => {
  it('transforms simple JSX element', () => {
    const inputCode = `
      const element = <div>Hello, World!</div>;
    `;

    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('transforms JSX element with attributes', () => {
    const inputCode = `
      const element = <div id="myId" class="myClass">Hello, World!</div>;
    `;

    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('transforms JSX element with dynamic expressions', () => {
    const inputCode = `
      const name = 'John';
      const element = <div>Hello, {name}!</div>;
    `;

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
      const element = <div {...props}>Hello, World!</div>;
    `;

    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('transforms JSX element with conditional attributes', () => {
    const inputCode = `
      const hasClass = true;
      const element = <div class={hasClass ? 'myClass' : 'otherClass'}>Hello, World!</div>;
    `;

    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('transforms JSX element with style attribute', () => {
    const inputCode = `
      const style = { color: 'red', fontSize: '16px' };
      const element = <div style={style}>Hello, World!</div>;
    `;

    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('transforms JSX element with class and style attributes', () => {
    const inputCode = `
      const hasClass = true;
      const style = { color: 'red', fontSize: '16px' };
      const element = <div class={hasClass ? 'myClass' : ''} style={style}>Hello, World!</div>;
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
      const element = <div id={null} class={undefined}>Hello, World!</div>;
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

  it('should work with bind api', () => {
    const inputCode = `
    const value = 1;
    <div>
    <p bind:value={value}>Paragraph 1</p>
    <p>Paragraph 2</p>
  </div>`;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with comment in JSX', () => {
    const inputCode = `
    const value = 1;
    <div>
      {/* comment */}
      <p bind:value={value}>Paragraph 1</p>
      <p>Paragraph 2</p>
    </div>`;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with static style transform to inline style', () => {
    const inputCode = `
      const element = <div style={{ color: 'red', fontSize: '16px' }}>Hello, World!</div>;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });
  it('should work with CSS Variables transform to inline style', () => {
    const inputCode = `
      const element = <div style={"--color: red"}>Hello, World!</div>;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });
  it('should work with dynamic style transform to inline style', () => {
    const inputCode = `
      const color =  "red"
      const style = { color, fontSize: '16px' };
      const element = <div style={style}>Hello, World!</div>;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with event handlers', () => {
    const inputCode = `
      const handleClick = () => console.log('clicked');
      const element = <button onClick={handleClick}>Click me</button>;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with multiple event handlers', () => {
    const inputCode = `
      const element = (
        <div
          onClick={() => console.log('clicked')}
          onMouseEnter={() => console.log('mouse enter')}
          onMouseLeave={() => console.log('mouse leave')}
        >
          Multiple Events
        </div>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with conditional rendering', () => {
    const inputCode = `
      const isVisible = true;
      const element = (
        <div>
          {isVisible && <p>Visible Content</p>}
          {isVisible ? <span>True</span> : <span>False</span>}
        </div>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with list rendering', () => {
    const inputCode = `
      const items = ['Item 1', 'Item 2', 'Item 3'];
      const element = (
        <ul>
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with nested components and props', () => {
    const inputCode = `
      const Child = ({ name, age }) => <div>Name: {name}, Age: {age}</div>;
      const Parent = () => (
        <div>
          <Child name="John" age={25} />
          <Child name="Jane" age={23} />
        </div>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with dynamic class names', () => {
    const inputCode = `
      const isActive = true;
      const element = <div class={isActive ? 'active' : ''}>Dynamic Class</div>;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with dynamic styles', () => {
    const inputCode = `
      const color = 'red';
      const element = <div style={{ color, fontSize: '16px' }}>Dynamic Style</div>;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with fragments and keys', () => {
    const inputCode = `
      const element = (
        <>
          <div key="1">First</div>
          <div key="2">Second</div>
        </>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with error boundaries', () => {
    const inputCode = `
      const ErrorBoundary = ({ children }) => {
        try {
          return children;
        } catch (error) {
          return <div>Error occurred!</div>;
        }
      };
      const element = (
        <ErrorBoundary>
          <div>Protected Content</div>
        </ErrorBoundary>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with refs', () => {
    const inputCode = `
      const myRef = { current: null };
      const element = <div ref={myRef}>Reference Element</div>;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with portals', () => {
    const inputCode = `
      const Portal = ({ children, target }) => {
        return <div data-portal-target={target}>{children}</div>;
      };
      const element = (
        <Portal target="modal">
          <div>Modal Content</div>
        </Portal>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with context', () => {
    const inputCode = `
      const ThemeContext = { Provider: ({ value, children }) => children };
      const element = (
        <ThemeContext.Provider value="dark">
          <div>Themed Content</div>
        </ThemeContext.Provider>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with memo components', () => {
    const inputCode = `
      const MemoComponent = ({ value }) => <div>Memo: {value}</div>;
      MemoComponent._memo = true;
      const element = <MemoComponent value={42} />;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with forwardRef components', () => {
    const inputCode = `
      const ForwardRefComponent = ({ children }, ref) => (
        <div ref={ref}>{children}</div>
      );
      ForwardRefComponent._forward = true;
      const element = <ForwardRefComponent>Forward Ref Content</ForwardRefComponent>;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with lazy components', () => {
    const inputCode = `
      const LazyComponent = ({ children }) => <div data-lazy>{children}</div>;
      LazyComponent._lazy = true;
      const element = <LazyComponent>Lazy Content</LazyComponent>;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with suspense boundaries', () => {
    const inputCode = `
      const Suspense = ({ children, fallback }) => (
        <div data-suspense>
          {children}
          {fallback}
        </div>
      );
      const element = (
        <Suspense fallback={<div>Loading...</div>}>
          <div>Content</div>
        </Suspense>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with error boundaries', () => {
    const inputCode = `
      const ErrorBoundary = ({ children, fallback }) => (
        <div data-error-boundary>
          {children}
          {fallback}
        </div>
      );
      const element = (
        <ErrorBoundary fallback={<div>Error occurred!</div>}>
          <div>Protected Content</div>
        </ErrorBoundary>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with portals', () => {
    const inputCode = `
      const Portal = ({ children, target }) => (
        <div data-portal-target={target}>{children}</div>
      );
      const element = (
        <Portal target="modal">
          <div>Modal Content</div>
        </Portal>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with context providers', () => {
    const inputCode = `
      const ThemeContext = { Provider: ({ value, children }) => children };
      const element = (
        <ThemeContext.Provider value="dark">
          <div data-theme="dark">Themed Content</div>
        </ThemeContext.Provider>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with dynamic imports', () => {
    const inputCode = `
      const DynamicComponent = ({ children }) => (
        <div data-dynamic>{children}</div>
      );
      const element = (
        <DynamicComponent>
          {import('./Component')}
        </DynamicComponent>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with refs and ref forwarding', () => {
    const inputCode = `
      const RefComponent = ({ children }, ref) => (
        <div ref={ref} data-ref>{children}</div>
      );
      const element = (
        <RefComponent ref={React.createRef()}>
          Ref Content
        </RefComponent>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with strict mode', () => {
    const inputCode = `
      const StrictMode = ({ children }) => (
        <div data-strict>{children}</div>
      );
      const element = (
        <StrictMode>
          <div>Strict Mode Content</div>
        </StrictMode>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with concurrent mode', () => {
    const inputCode = `
      const ConcurrentMode = ({ children }) => (
        <div data-concurrent>{children}</div>
      );
      const element = (
        <ConcurrentMode>
          <div>Concurrent Mode Content</div>
        </ConcurrentMode>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with suspense and lazy loading', () => {
    const inputCode = `
      const LazyComponent = ({ children }) => <div data-lazy>{children}</div>;
      LazyComponent._lazy = true;
      const element = (
        <Suspense fallback={<div>Loading...</div>}>
          <LazyComponent>Lazy Content</LazyComponent>
        </Suspense>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with multiple contexts', () => {
    const inputCode = `
      const ThemeContext = { Provider: ({ value, children }) => children };
      const UserContext = { Provider: ({ value, children }) => children };
      const element = (
        <ThemeContext.Provider value="dark">
          <UserContext.Provider value={{ name: 'John' }}>
            <div data-theme="dark" data-user="John">
              Nested Context Content
            </div>
          </UserContext.Provider>
        </ThemeContext.Provider>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with custom hooks in components', () => {
    const inputCode = `
      const useCustomHook = () => ({ value: 'custom' });
      const Component = () => {
        const { value } = useCustomHook();
        return <div data-hook={value}>Hook Content</div>;
      };
      const element = <Component />;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with memo and custom comparison', () => {
    const inputCode = `
      const MemoComponent = ({ value }) => <div>Memo: {value}</div>;
      MemoComponent._memo = true;
      MemoComponent._compare = (prev, next) => prev.value === next.value;
      const element = <MemoComponent value={42} />;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with forwardRef and memo', () => {
    const inputCode = `
      const ForwardRefMemoComponent = React.memo(React.forwardRef((props, ref) => (
        <div ref={ref}>Forward Ref Memo: {props.value}</div>
      )));
      const element = <ForwardRefMemoComponent value={42} ref={React.createRef()} />;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with suspense and error boundary combination', () => {
    const inputCode = `
      const element = (
        <ErrorBoundary fallback={<div>Error occurred!</div>}>
          <Suspense fallback={<div>Loading...</div>}>
            <div>Protected and Suspended Content</div>
          </Suspense>
        </ErrorBoundary>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with portals and refs', () => {
    const inputCode = `
      const Portal = ({ children, target }, ref) => (
        <div ref={ref} data-portal-target={target}>{children}</div>
      );
      const element = (
        <Portal target="modal" ref={React.createRef()}>
          <div>Modal Content with Ref</div>
        </Portal>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with context and memo combination', () => {
    const inputCode = `
      const ThemeContext = { Provider: ({ value, children }) => children };
      const MemoComponent = ({ theme }) => <div data-theme={theme}>Memo Content</div>;
      MemoComponent._memo = true;
      const element = (
        <ThemeContext.Provider value="dark">
          <MemoComponent theme="dark" />
        </ThemeContext.Provider>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with suspense and dynamic imports', () => {
    const inputCode = `
      const LazyComponent = ({ children }) => <div data-lazy>{children}</div>;
      LazyComponent._lazy = true;
      const element = (
        <Suspense fallback={<div>Loading...</div>}>
          <LazyComponent>
            {import('./Component')}
          </LazyComponent>
        </Suspense>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with strict mode and error boundary', () => {
    const inputCode = `
      const element = (
        <StrictMode>
          <ErrorBoundary fallback={<div>Error occurred!</div>}>
            <div>Strict Mode Protected Content</div>
          </ErrorBoundary>
        </StrictMode>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with concurrent mode and suspense', () => {
    const inputCode = `
      const element = (
        <ConcurrentMode>
          <Suspense fallback={<div>Loading...</div>}>
            <div>Concurrent Mode Suspended Content</div>
          </Suspense>
        </ConcurrentMode>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });
});
