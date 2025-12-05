import { getTransform } from './transform';
const transformCode = getTransform('jsx', { mode: 'ssg', hmr: false });
describe('jsx SSG transform', () => {
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

  it('transforms ssg JSX element with nested expressions and children', () => {
    const inputCode = `
      const name = 'John';
      const element = (
        <div class='root'>
          <p class={name}>itis:{name}'s Profile</p>
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
          <input type="text" />
          <br/>
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

  it('should work with static data fetching in SSG', () => {
    const inputCode = `
      const StaticDataComponent = ({ data }) => (
        <div data-static>
          {JSON.stringify(data)}
        </div>
      );
      const element = <StaticDataComponent data={{ key: 'value' }} />;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with static paths generation', () => {
    const inputCode = `
      const StaticPathsComponent = ({ paths }) => (
        <div data-paths>
          {paths.map(path => (
            <div key={path} data-path={path} />
          ))}
        </div>
      );
      const element = <StaticPathsComponent paths={['/page1', '/page2']} />;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with static props generation', () => {
    const inputCode = `
      const StaticPropsComponent = ({ props }) => (
        <div data-props>
          {Object.entries(props).map(([key, value]) => (
            <div key={key} data-prop-key={key} data-prop-value={value} />
          ))}
        </div>
      );
      const element = <StaticPropsComponent props={{ title: 'Page Title' }} />;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with static image optimization', () => {
    const inputCode = `
      const StaticImage = ({ src, alt }) => (
        <img src={src} alt={alt} data-static-image />
      );
      const element = <StaticImage src="/static/image.jpg" alt="Static Image" />;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with static metadata', () => {
    const inputCode = `
      const StaticMetadata = ({ metadata }) => (
        <head data-static-metadata>
          <title>{metadata.title}</title>
          <meta name="description" content={metadata.description} />
        </head>
      );
      const element = (
        <StaticMetadata
          metadata={{
            title: 'Static Page',
            description: 'Static page description'
          }}
        />
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with static redirects', () => {
    const inputCode = `
      const StaticRedirect = ({ from, to }) => (
        <div data-redirect data-from={from} data-to={to} />
      );
      const element = <StaticRedirect from="/old" to="/new" />;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with static rewrites', () => {
    const inputCode = `
      const StaticRewrite = ({ source, destination }) => (
        <div data-rewrite data-source={source} data-destination={destination} />
      );
      const element = <StaticRewrite source="/api" destination="/api/v1" />;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with static headers', () => {
    const inputCode = `
      const StaticHeaders = ({ headers }) => (
        <div data-headers>
          {Object.entries(headers).map(([key, value]) => (
            <div key={key} data-header-key={key} data-header-value={value} />
          ))}
        </div>
      );
      const element = (
        <StaticHeaders
          headers={{
            'Cache-Control': 'public, max-age=31536000',
            'X-Frame-Options': 'DENY'
          }}
        />
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with static environment variables', () => {
    const inputCode = `
      const StaticEnv = ({ env }) => (
        <div data-env>
          {Object.entries(env).map(([key, value]) => (
            <div key={key} data-env-key={key} data-env-value={value} />
          ))}
        </div>
      );
      const element = (
        <StaticEnv
          env={{
            NEXT_PUBLIC_API_URL: 'https://api.example.com',
            NEXT_PUBLIC_CDN_URL: 'https://cdn.example.com'
          }}
        />
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with static locales', () => {
    const inputCode = `
      const StaticLocale = ({ locale, messages }) => (
        <div data-locale={locale}>
          {Object.entries(messages).map(([key, value]) => (
            <div key={key} data-message-key={key} data-message-value={value} />
          ))}
        </div>
      );
      const element = (
        <StaticLocale
          locale="en"
          messages={{
            hello: 'Hello',
            welcome: 'Welcome to our site'
          }}
        />
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with static robots.txt', () => {
    const inputCode = `
      const StaticRobots = ({ rules }) => (
        <div data-robots>
          {rules.map((rule, index) => (
            <div key={index} data-rule={rule} />
          ))}
        </div>
      );
      const element = (
        <StaticRobots
          rules={[
            'User-agent: *',
            'Allow: /',
            'Disallow: /private/'
          ]}
        />
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with static sitemap.xml', () => {
    const inputCode = `
      const StaticSitemap = ({ urls }) => (
        <div data-sitemap>
          {urls.map((url, index) => (
            <div key={index} data-url={url} />
          ))}
        </div>
      );
      const element = (
        <StaticSitemap
          urls={[
            'https://example.com/',
            'https://example.com/about',
            'https://example.com/contact'
          ]}
        />
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with static manifest.json', () => {
    const inputCode = `
      const StaticManifest = ({ manifest }) => (
        <div data-manifest>
          {Object.entries(manifest).map(([key, value]) => (
            <div key={key} data-manifest-key={key} data-manifest-value={value} />
          ))}
        </div>
      );
      const element = (
        <StaticManifest
          manifest={{
            name: 'My Static App',
            short_name: 'App',
            start_url: '/',
            display: 'standalone',
            background_color: '#ffffff',
            theme_color: '#000000'
          }}
        />
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with static security headers', () => {
    const inputCode = `
      const StaticSecurity = ({ headers }) => (
        <div data-security>
          {Object.entries(headers).map(([key, value]) => (
            <div key={key} data-security-key={key} data-security-value={value} />
          ))}
        </div>
      );
      const element = (
        <StaticSecurity
          headers={{
            'Content-Security-Policy': "default-src 'self'",
            'X-Content-Type-Options': 'nosniff',
            'X-XSS-Protection': '1; mode=block'
          }}
        />
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with static error pages', () => {
    const inputCode = `
      const StaticError = ({ code, message }) => (
        <div data-error data-code={code}>
          <h1>{code}</h1>
          <p>{message}</p>
        </div>
      );
      const element = (
        <StaticError
          code="404"
          message="Page not found"
        />
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with static API routes', () => {
    const inputCode = `
      const StaticApi = ({ endpoint, handler }) => (
        <div data-api data-endpoint={endpoint}>
          {handler}
        </div>
      );
      const element = (
        <StaticApi
          endpoint="/api/static"
          handler="export default function handler(req, res) { res.json({ data: 'static' }) }"
        />
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with static middleware', () => {
    const inputCode = `
      const StaticMiddleware = ({ middleware }) => (
        <div data-middleware>
          {middleware}
        </div>
      );
      const element = (
        <StaticMiddleware
          middleware="export function middleware(request) { return NextResponse.next() }"
        />
      );
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });
});
