import { getTransform } from './transform';
const transformCode = getTransform('jsx', { mode: 'server', hmr: false });
const transformCodeWithFor = getTransform('jsx', {
  mode: 'server',
  hmr: false,
  enableFor: true,
});
describe('jsx server transform', () => {
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

  it.each(['title', 'textarea', 'style'])(
    'serializes dynamic <%s> children through one marker-free whole-text slot',
    (tag) => {
      const output = transformCode(`const element = <${tag}>A{first}B{second}</${tag}>;`);

      expect(output.match(/_ssrTextContent\$\(/g)).toHaveLength(1);
      expect(output).not.toContain('@essor:start');
      expect(output).not.toContain('<!--0-->');
    },
  );

  it('rejects dynamic executable script children on the server', () => {
    expect(() => transformCode('const element = <script>{source}</script>;')).toThrow(
      /dynamic <script>/i,
    );
  });

  it.each(['style', 'script'])(
    'preserves static <%s> raw text without HTML entity rewriting',
    (tag) => {
      const output = transformCode(`const element = <${tag}>{'a&b < c'}</${tag}>;`);

      expect(output).toContain(`["<${tag}>a&b < c</${tag}>"]`);
      expect(output).not.toContain('a&amp;b &lt; c');
    },
  );

  it('duplicates a static leading textarea LF for parser round-trip', () => {
    const output = transformCode("const element = <textarea>{'\\nline'}</textarea>;");

    expect(output).toContain('["<textarea>\\n\\nline</textarea>"]');
  });

  it('emits a boundary-typed range start before every dynamic child slot', () => {
    const comment = transformCode('const element = <div>{value}text</div>');
    const element = transformCode('const element = <div>{null}<span>right</span></div>');
    const tail = transformCode('const element = <div><span>left</span>{value}</div>');

    expect(comment).toContain('"<div><!--@essor:start:c:0-->"');
    expect(comment).toContain('"<!--0-->text</div>"');
    expect(element).toContain('"<div><!--@essor:start:e:0-->"');
    expect(element).toContain('"<span data-hk-idx=\\"0\\">right</span></div>"');
    expect(tail).toContain('"<div><span>left</span><!--@essor:start:t:0-->"');
    expect(tail).toContain('", "</div>"');
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

  it('keeps ordinary closing tags regardless of omitClosingTags', () => {
    const inputCode = `
      const element = <div><span><em>End</em></span></div>;
    `;

    const output = transformCode(inputCode);

    expect(output).toContain('["<div><span><em>End</em></span></div>"]');
  });

  it('keeps earlier and final sibling closing tags in SSR templates', () => {
    const inputCode = `
      const element = <div><span>First</span><p>Last</p></div>;
    `;

    const output = transformCode(inputCode);

    expect(output).toContain('["<div><span>First</span><p>Last</p></div>"]');
    expect(output).not.toContain('<span>First<p>');
  });

  it('serializes void tags with XML self-closing slashes', () => {
    const inputCode = `
      const element = <div><input disabled /><br /></div>;
    `;

    const output = transformCode(inputCode);

    expect(output).toContain('["<div><input disabled /><br /></div>"]');
    expect(output).not.toContain('<input disabled><br>');
  });

  it('transforms server JSX element with nested expressions and children', () => {
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

  it('escapes component children props in SSR output', () => {
    const inputCode = `
      const Layout = (ctx) => <main>{ctx.children}</main>;
      const ComputedLayout = (ctx) => <main>{ctx["children"]}</main>;
      const Destructured = ({ children }) => <section>{children}</section>;
      const element = (
        <>
          <Layout><span>Child</span></Layout>
          <ComputedLayout><span>Child</span></ComputedLayout>
          <Destructured><span>Child</span></Destructured>
        </>
      );
    `;

    const output = transformCode(inputCode);
    // SEC-P0-01: `props.children` is NOT trusted by position — a caller can
    // pass an arbitrary string via `<Layout children={userInput}/>`. The
    // consumption site wraps it in escape(); compiled children arrive as
    // WeakSet-branded SSR nodes, which escape() passes through verbatim, so
    // legitimate nested JSX is not double-escaped.
    expect(output).toContain('_escape$(ctx.children)');
    expect(output).toContain('_escape$(ctx["children"])');
    expect(output).toContain('_escape$(__props.children)');
  });

  it('defers expression-child escaping to the receiving component', () => {
    const output = transformCode(`
      const Layout = p => <main>{p.children}</main>;
      const el = <Layout>{payload}</Layout>;
      const fallback = <Layout>{payload || <strong>fallback</strong>}</Layout>;
    `);

    expect(output).toContain('_escape$(p.children)');
    expect(output).toContain('"children": [payload]');
    expect(output).not.toContain('"children": [_escape$(payload)]');
    expect(output).toContain('"children": [payload || _ssr$(');
    expect(output).not.toContain('"children": [_escape$(payload ||');
  });

  it('keeps local children variables escaped in SSR text nodes', () => {
    const inputCode = `
      const children = '<span>unsafe</span>';
      const element = <div>{children}</div>;
    `;

    const output = transformCode(inputCode);
    // A plain `{expr}` child is the untrusted-text channel → wrapped in escape().
    expect(output).toContain('_escape$(children)');
  });

  it('keeps arbitrary children properties escaped in SSR text nodes', () => {
    const inputCode = `
      const element = <div>{state.children}</div>;
    `;

    const output = transformCode(inputCode);
    // `state.children` is NOT the component children passthrough — it's an
    // ordinary member expression → escaped as untrusted child text.
    expect(output).toContain('_escape$(state.children)');
  });

  it('does not trust user calls named like generated SSR helpers', () => {
    const inputCode = `
      const _render$2 = (value) => value;
      const element = <div>{_render$2(userText)}</div>;
    `;

    const output = transformCode(inputCode);
    // A user call shaped like a generated helper is still untrusted text.
    expect(output).toContain('_escape$(_render$2(userText))');
  });

  it('keeps local JSX factory calls escaped in SSR children', () => {
    const inputCode = `
      function renderIcon(kind) {
        return kind === 'github'
          ? <span class="i-carbon-logo-github" />
          : <span class="text-sm">{kind}</span>;
      }

      const element = <a>{renderIcon(item.icon)}</a>;
    `;

    const output = transformCode(inputCode);
    expect(output).toContain('_escape$(renderIcon(item.icon))');
  });

  it('keeps computed values escaped in SSR children even when their factory returns JSX', () => {
    const inputCode = `
      import { computed } from 'essor';

      const content = computed(() => {
        switch (pageType) {
          case 'home':
            return <Home />;
          case 'doc':
            return <section><span>Ready</span></section>;
          default:
            return <NotFound />;
        }
      });
      const element = <main>{content.value}</main>;
    `;

    const output = transformCode(inputCode);
    expect(output).toContain('_escape$(content.value)');
  });

  it('does not trust reassigned local JSX factories for raw SSR children', () => {
    const inputCode = `
      function renderIcon(kind) {
        return <span>{kind}</span>;
      }

      renderIcon = (kind) => '<img src=x onerror=alert(1)>';
      const element = <a>{renderIcon(item.icon)}</a>;
    `;

    const output = transformCode(inputCode);
    expect(output).toContain('_escape$(renderIcon(item.icon))');
  });

  it('keeps computed string values escaped in SSR children', () => {
    const inputCode = `
      import { computed } from 'essor';

      const content = computed(() => '<img src=x onerror=alert(1)>');
      const element = <main>{content.value}</main>;
    `;

    const output = transformCode(inputCode);
    expect(output).toContain('_escape$(content.value)');
  });

  it('does not trust user computed calls for raw SSR children', () => {
    const inputCode = `
      function computed(factory) {
        return { value: factory() };
      }

      const content = computed(() => <span>local</span>);
      const element = <main>{content.value}</main>;
    `;

    const output = transformCode(inputCode);
    expect(output).toContain('_escape$(content.value)');
  });

  it('keeps mixed local factory return values escaped in SSR children', () => {
    const inputCode = `
      function renderContent(kind) {
        return kind === 'html'
          ? <span class="safe" />
          : '<img src=x onerror=alert(1)>';
      }

      const element = <main>{renderContent(pageType)}</main>;
    `;

    const output = transformCode(inputCode);
    expect(output).toContain('_escape$(renderContent(pageType))');
  });

  it('omits dynamic comment markers when a stable static sibling can anchor hydration', () => {
    const inputCode = `
      const element = (
        <div>
          <Feedback result={result} />
          <form>
            <button>Save</button>
          </form>
        </div>
      );
    `;
    const output = transformCode(inputCode);

    expect(output).toContain(
      '"<div><!--@essor:start:e:0-->", "<form data-hk-idx=\\"0\\"><button>Save</button></form></div>"',
    );
    expect(output).not.toContain('<!--0--><form>');
  });

  it('uses an internal hydration anchor attribute without colliding with user data-idx', () => {
    const inputCode = `
      const element = (
        <div>
          <Feedback result={result} />
          <form data-idx="row">
            <button>Save</button>
          </form>
        </div>
      );
    `;
    const output = transformCode(inputCode);

    expect(output).toContain('data-idx=\\"row\\" data-hk-idx=\\"0\\"');
    expect(output).not.toContain('data-idx=\\"row\\" data-idx=\\"0\\"');
  });

  it('omits trailing dynamic comment markers', () => {
    const inputCode = `
      const element = (
        <div>
          <header>Title</header>
          {footer}
        </div>
      );
    `;
    const output = transformCode(inputCode);

    expect(output).toContain('"<div><header>Title</header><!--@essor:start:t:0-->", "</div>"');
    expect(output).not.toContain('<!--0--></div>');
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

  it('renders dynamic SVG class via ssrClass (string, no isSVG flag needed)', () => {
    // Server mode builds an HTML string and never touches el.className, so SVG
    // needs no special handling — `class` compiles to the same ssrClass slot as
    // for HTML elements.
    const inputCode = `
      const p = {};
      const element = <svg class={p.c}><line x1="5" /></svg>;
    `;

    const output = transformCode(inputCode);
    expect(output).toContain('_ssrClass$(p.c)');
    expect(output).not.toContain('patchClass');
    expect(output).toMatchSnapshot();
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
    const $value = 1;
    <div>
      {/* comment */}
      <p bind:value={$value}>Paragraph 1</p>
      <p>Paragraph 2</p>
    </div>`;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('emits ssrBind for bind:value with signal', () => {
    const inputCode = `
    const $name = '';
    <input bind:value={$name} />;`;
    const output = transformCode(inputCode);
    expect(output).toContain('ssrBind');
    expect(output).toContain('"value"');
  });

  it('emits ssrBind for bind nested inside an otherwise static parent', () => {
    const inputCode = `
    const $name = '';
    <form><input bind:value={$name} /></form>;`;
    const output = transformCode(inputCode);
    expect(output).toContain('ssrBind');
    expect(output).not.toContain('"<form><input /></form>"');
  });

  it('emits ssrBind with trim modifier', () => {
    const inputCode = `
    const $name = '';
    <input bind:value={[$name, { trim: true }]} />;`;
    const output = transformCode(inputCode);
    expect(output).toContain('ssrBind');
    expect(output).toContain('trim');
  });

  it('emits ssrBind for bind:checked', () => {
    const inputCode = `
    const $agree = false;
    <input type="checkbox" bind:checked={$agree} />;`;
    const output = transformCode(inputCode);
    expect(output).toContain('ssrBind');
    expect(output).toContain('"checked"');
  });

  it('emits ssrBind with ownValue for checkbox group', () => {
    const inputCode = `
    const $skills = [];
    <input type="checkbox" value="ts" bind:checked={$skills} />;`;
    const output = transformCode(inputCode);
    expect(output).toContain('ssrBind');
    expect(output).toContain('"checked"');
    expect(output).toContain('"ts"');
  });

  it('emits dynamic own value for checkbox group SSR', () => {
    const inputCode = `
    const skill = { id: 'ts' };
    const $skills = [];
    <input type="checkbox" value={skill.id} bind:checked={$skills} />;`;
    const output = transformCode(inputCode);
    expect(output).toContain('skill.id');
    expect(output).toContain('ssrBind');
  });

  it('emits radio SSR bind with element type and own value context', () => {
    const inputCode = `
    const $theme = 'dark';
    <input type="radio" value="dark" bind:checked={$theme} />;`;
    const output = transformCode(inputCode);
    expect(output).toContain('ssrBind');
    expect(output).toContain('"radio"');
    expect(output).toContain('"dark"');
  });

  it('emits selected SSR bindings for select value binding', () => {
    const inputCode = `
    const $city = 'shanghai';
    <select bind:value={$city}>
      <option value="beijing">Beijing</option>
      <option value="shanghai">Shanghai</option>
    </select>;`;
    const output = transformCode(inputCode);
    expect(output).toContain('ssrSelected');
    expect(output).toContain('"shanghai"');
    expect(output).not.toContain('ssrAttr("selected"');
    expect(output).not.toContain('ssrBind("value", $city.value)');
  });

  it('emits textarea SSR value as escaped text content', () => {
    const inputCode = `
    const $bio = '<hello>';
    <textarea bind:value={$bio} />;`;
    const output = transformCode(inputCode);
    expect(output).toContain('ssrTextValue');
    expect(output).not.toContain('ssrBind("value", $bio.value)');
  });

  it('does not emit ssrBind for bind:files', () => {
    const inputCode = `
    let $files = null;
    <input type="file" bind:files={$files} />;`;
    const output = transformCode(inputCode);
    // files binding is present in output but ssrBind("files",...) returns '' at runtime
    expect(output).toContain('ssrBind');
    expect(output).toContain('"files"');
  });

  it('should work with event handlers in server', () => {
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

  it('should work with conditional rendering in server', () => {
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

  it('marks JSX branches in text expressions as safe server HTML', () => {
    const inputCode = `
      const isVisible = true;
      const element = (
        <div>
          {isVisible && <p>No response yet</p>}
          {isVisible ? <span>True</span> : '<unsafe>'}
        </div>
      );
    `;

    const output = transformCode(inputCode);
    // `&&` keeps its condition raw and only renders the JSX branch. Other
    // expressions are escaped as a whole so their JS short-circuit semantics
    // stay intact; escape() unwraps compiler-owned SSR nodes at runtime.
    expect(output).toContain('escape as _escape$');
    expect(output).toContain('isVisible && _ssr$(');
    expect(output).not.toContain('_escape$(isVisible && _ssr$');
    expect(output).toContain('_escape$(isVisible ? _ssr$(');
    expect(output).toContain(": '<unsafe>')");
  });

  it('preserves short-circuit semantics for nullish and fallback child expressions', () => {
    const inputCode = `
      const element = (
        <div>
          {maybe ?? <span>Fallback</span>}
          {count || <strong>Empty</strong>}
        </div>
      );
    `;

    const output = transformCode(inputCode);
    expect(output).toContain('_escape$(maybe ?? _ssr$(');
    expect(output).toContain('_escape$(count || _ssr$(');
    expect(output).not.toContain('_escape$(maybe) ??');
    expect(output).not.toContain('_escape$(count) ||');
  });

  it('should work with list rendering in server', () => {
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

  it('compiles map expressions to For in server when enableFor is true', () => {
    const inputCode = `
      const element = (
        <tbody>
          {items.map(item => <Row key={item} item={item} />)}
        </tbody>
      );
    `;
    const output = transformCodeWithFor(inputCode);
    expect(output).toContain('For as _For$');
    expect(output).toContain('_ssrComponent$(_For$, {');
    expect(output).not.toContain('items.map(');
  });

  it('keeps optional-chained map expressions as escaped child expressions in server', () => {
    const inputCode = `
      const element = (
        <div>
          {hero.actions?.map(action => (
            <a key={action.link} href={action.link}>{action.text}</a>
          ))}
        </div>
      );
    `;
    const output = transformCodeWithFor(inputCode);
    expect(output).toContain('_escape$(hero.actions?.map');
    expect(output).not.toContain('For as _For$');
    expect(output).not.toContain('_ssrComponent$(_For$, {');
  });

  it('should work with nested components and props in server', () => {
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

  it('should work with async data in server', () => {
    const inputCode = `
      const AsyncComponent = async ({ data }) => {
        const result = await data;
        return <div>{result}</div>;
      };
      const element = <AsyncComponent data={Promise.resolve('async content')} />;
    `;
    expect(transformCode(inputCode)).toMatchSnapshot();
  });

  it('should work with streaming server', () => {
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

  it('should work with head management in server', () => {
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

  it('should work with error handling in server', () => {
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

  it('should work with context in server', () => {
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

  it('should work with CSS-in-JS in server', () => {
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

  it('should work with data fetching in server', () => {
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

  it('should work with static data fetching in server', () => {
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

  it('transition: SSR output contains the child markup with no animation classes', () => {
    const inputCode = `
    const r = <Transition name="fade"><div class="box">hi</div></Transition>
    `;
    const out = transformCode(inputCode);
    expect(out).not.toMatch(/fade-enter-from|fade-enter-active|fade-enter-to/);
    expect(out).not.toMatch(/fade-leave-from|fade-leave-active|fade-leave-to/);
    expect(out).toContain('Transition');
  });

  // ── Behavior assertions (no snapshots) ──────────────────────────────

  it('escapes dynamic child expressions through escape()', () => {
    const output = transformCode(`const name = 'x'; const el = <div>{name}</div>;`);
    // Bare interpolations go through the child-text escaping channel —
    // this is the XSS default-escape contract (see server/security docs).
    expect(output).toContain('_escape$(name)');
    expect(output).toContain('_ssr$(_tmpl$, _getHydrationKey$(), _escape$(name))');
  });

  it('wraps component children in lazy thunks for ssrComponent', () => {
    const output = transformCode(`function App(){ return <Foo><span>x</span></Foo>; }`);
    // Children compile to deferred thunks so they evaluate inside the
    // component's scope (provide/inject correctness during serialization).
    expect(output).toContain('_ssrComponent$(Foo,');
    expect(output).toContain('"children": [() => _ssr$(_tmpl$, _getHydrationKey$())]');
  });

  it('emits ssrBind with the element tag for bind:value', () => {
    const output = transformCode(`let $v = 1; const el = <input bind:value={$v} />;`);
    expect(output).toContain('_ssrBind$("value", $v.value');
    expect(output).toContain('tag: "input"');
  });

  it('omits static boolean-attr false from the SSR template (CMP-03)', () => {
    const output = transformCode(`const el = <input disabled={false} />;`);
    expect(output).not.toContain('disabled');
  });
});
