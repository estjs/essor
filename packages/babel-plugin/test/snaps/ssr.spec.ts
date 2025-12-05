import { getTransform } from './transform';
const transformCode = getTransform('jsx', { mode: 'ssr', hmr: false });
describe('jsx SSR transform', () => {
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

  it('should work with event handlers in SSR', () => {
    const inputCode = `
      const handleClick = () => console.log('clicked');
      const element = <button onClick={handleClick}>Click me</button>;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with hydration attributes', () => {
    const inputCode = `
      const element = <div data-hydrate="true">Hydration Content</div>;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with conditional rendering in SSR', () => {
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

  it('should work with list rendering in SSR', () => {
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

  it('should work with nested components and props in SSR', () => {
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

  it('should work with async data in SSR', () => {
    const inputCode = `
      const AsyncComponent = async ({ data }) => {
        const result = await data;
        return <div>{result}</div>;
      };
      const element = <AsyncComponent data={Promise.resolve('async content')} />;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with streaming SSR', () => {
    const inputCode = `
      const StreamingComponent = ({ chunks }) => (
        <div>
          {chunks.map((chunk, index) => (
            <div key={index} data-chunk={index}>{chunk}</div>
          ))}
        </div>
      );
      const element = <StreamingComponent chunks={['chunk1', 'chunk2']} />;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with streaming SSR and suspense', () => {
    const inputCode = `
      const StreamingSuspense = ({ children, fallback }) => (
        <div data-streaming>
          <Suspense fallback={fallback}>
            {children}
          </Suspense>
        </div>
      );
      const element = (
        <StreamingSuspense fallback={<div>Loading...</div>}>
          <div>Streaming Content</div>
        </StreamingSuspense>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with streaming SSR and error boundaries', () => {
    const inputCode = `
      const StreamingErrorBoundary = ({ children, fallback }) => (
        <div data-streaming-error>
          <ErrorBoundary fallback={fallback}>
            {children}
          </ErrorBoundary>
        </div>
      );
      const element = (
        <StreamingErrorBoundary fallback={<div>Error occurred!</div>}>
          <div>Protected Streaming Content</div>
        </StreamingErrorBoundary>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with streaming SSR and context', () => {
    const inputCode = `
      const StreamingContext = ({ value, children }) => (
        <div data-streaming-context>
          <ThemeContext.Provider value={value}>
            {children}
          </ThemeContext.Provider>
        </div>
      );
      const element = (
        <StreamingContext value="dark">
          <div>Streaming Context Content</div>
        </StreamingContext>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with streaming SSR and portals', () => {
    const inputCode = `
      const StreamingPortal = ({ target, children }) => (
        <div data-streaming-portal data-target={target}>
          {children}
        </div>
      );
      const element = (
        <StreamingPortal target="modal">
          <div>Streaming Portal Content</div>
        </StreamingPortal>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with streaming SSR and refs', () => {
    const inputCode = `
      const StreamingRef = ({ children }, ref) => (
        <div ref={ref} data-streaming-ref>
          {children}
        </div>
      );
      const element = (
        <StreamingRef ref={React.createRef()}>
          <div>Streaming Ref Content</div>
        </StreamingRef>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with streaming SSR and memo', () => {
    const inputCode = `
      const StreamingMemo = ({ value }) => (
        <div data-streaming-memo>{value}</div>
      );
      StreamingMemo._memo = true;
      const element = <StreamingMemo value="Memo Content" />;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with streaming SSR and forwardRef', () => {
    const inputCode = `
      const StreamingForwardRef = React.forwardRef((props, ref) => (
        <div ref={ref} data-streaming-forward>
          {props.children}
        </div>
      ));
      const element = (
        <StreamingForwardRef ref={React.createRef()}>
          <div>Streaming Forward Ref Content</div>
        </StreamingForwardRef>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with streaming SSR and lazy loading', () => {
    const inputCode = `
      const StreamingLazy = ({ children }) => (
        <div data-streaming-lazy>{children}</div>
      );
      StreamingLazy._lazy = true;
      const element = (
        <Suspense fallback={<div>Loading...</div>}>
          <StreamingLazy>Lazy Content</StreamingLazy>
        </Suspense>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with streaming SSR and dynamic imports', () => {
    const inputCode = `
      const StreamingDynamic = ({ children }) => (
        <div data-streaming-dynamic>{children}</div>
      );
      const element = (
        <Suspense fallback={<div>Loading...</div>}>
          <StreamingDynamic>
            {import('./Component')}
          </StreamingDynamic>
        </Suspense>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with streaming SSR and multiple contexts', () => {
    const inputCode = `
      const StreamingContexts = ({ theme, user, children }) => (
        <div data-streaming-contexts>
          <ThemeContext.Provider value={theme}>
            <UserContext.Provider value={user}>
              {children}
            </UserContext.Provider>
          </ThemeContext.Provider>
        </div>
      );
      const element = (
        <StreamingContexts
          theme="dark"
          user={{ name: 'John' }}
        >
          <div>Multiple Contexts Content</div>
        </StreamingContexts>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with streaming SSR and custom hooks', () => {
    const inputCode = `
      const useStreamingHook = () => ({ value: 'streaming' });
      const StreamingHook = () => {
        const { value } = useStreamingHook();
        return <div data-streaming-hook>{value}</div>;
      };
      const element = <StreamingHook />;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with streaming SSR and error handling', () => {
    const inputCode = `
      const StreamingError = ({ error, children }) => (
        <div data-streaming-error>
          {error ? (
            <div>Error: {error.message}</div>
          ) : (
            children
          )}
        </div>
      );
      const element = (
        <StreamingError error={null}>
          <div>Streaming Content</div>
        </StreamingError>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with streaming SSR and loading states', () => {
    const inputCode = `
      const StreamingLoading = ({ isLoading, children }) => (
        <div data-streaming-loading>
          {isLoading ? (
            <div>Loading...</div>
          ) : (
            children
          )}
        </div>
      );
      const element = (
        <StreamingLoading isLoading={false}>
          <div>Loaded Content</div>
        </StreamingLoading>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with streaming SSR and data fetching', () => {
    const inputCode = `
      const StreamingData = ({ data, children }) => (
        <div data-streaming-data>
          {data ? (
            children
          ) : (
            <div>Loading data...</div>
          )}
        </div>
      );
      const element = (
        <StreamingData data={{ key: 'value' }}>
          <div>Data Content</div>
        </StreamingData>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with streaming SSR and hydration', () => {
    const inputCode = `
      const StreamingHydration = ({ children }) => (
        <div data-streaming-hydration>
          {children}
        </div>
      );
      const element = (
        <StreamingHydration>
          <div data-hydrate="true">Hydration Content</div>
        </StreamingHydration>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with streaming SSR and suspense boundaries', () => {
    const inputCode = `
      const StreamingSuspenseBoundary = ({ children, fallback }) => (
        <div data-streaming-suspense>
          <Suspense fallback={fallback}>
            {children}
          </Suspense>
        </div>
      );
      const element = (
        <StreamingSuspenseBoundary fallback={<div>Loading...</div>}>
          <div>Suspense Content</div>
        </StreamingSuspenseBoundary>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with head management in SSR', () => {
    const inputCode = `
      const Head = ({ children }) => <head data-ssr>{children}</head>;
      const element = (
        <Head>
          <title>Page Title</title>
          <meta name="description" content="Page description" />
        </Head>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with error handling in SSR', () => {
    const inputCode = `
      const ErrorBoundary = ({ fallback, children }) => {
        try {
          return children;
        } catch (error) {
          return fallback;
        }
      };
      const element = (
        <ErrorBoundary fallback={<div>Error Page</div>}>
          <div>Protected Content</div>
        </ErrorBoundary>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with context in SSR', () => {
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

  it('should work with CSS-in-JS in SSR', () => {
    const inputCode = `
      const StyledComponent = ({ className, children }) => (
        <div class={className} data-styled>
          {children}
        </div>
      );
      const element = (
        <StyledComponent className="generated-class">
          Styled Content
        </StyledComponent>
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with data fetching in SSR', () => {
    const inputCode = `
      const DataComponent = ({ data }) => (
        <div data-ssr-data>
          {JSON.stringify(data)}
        </div>
      );
      const element = <DataComponent data={{ key: 'value' }} />;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });
});
