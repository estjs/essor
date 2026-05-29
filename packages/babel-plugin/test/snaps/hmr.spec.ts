import { describe, expect, it } from 'vitest';
import { transformAsync } from '@babel/core';
import pluginFactory from '../../src';

describe('hMR transformation', () => {
  const transform = async (code: string, hmr = true, filename = 'test.tsx') => {
    const result = await transformAsync(code, {
      plugins: [[pluginFactory, { hmr, bundler: 'vite' }]],
      filename,
      parserOpts: {
        plugins: ['jsx', 'typescript'],
      },
    });
    return result?.code || '';
  };

  const extractSignature = (output: string, name: string): string | undefined => {
    const match = output.match(new RegExp(`${name}\\.__signature = "([^"]*)"`));
    return match?.[1];
  };

  it('should replace user import alias (cc) with HMR component', async () => {
    const input = `
          import { createComponent as cc } from 'essor';
          function App() {
            return <div>Hello</div>;
          }
          cc(App);
    `;

    const output = await transform(input);

    expect(output).toMatchSnapshot();
  });

  it('should handle multiple createComponent aliases', async () => {
    const input = `
          import { createApp, signal } from 'essor';
          function Counter() {
            return <div>Counter</div>;
          }
          function App() {
             function Counter1() {
              function Counter2() {
            return <div>Counter</div>;
          }
             return <div>Counter</div>;
          }
            return <div>
              <Counter />
            </div>;
          }
          createApp(App, 'root');
    `;

    const output = await transform(input);

    expect(output).toMatchSnapshot();
  });

  it('only registers top-level components for HMR metadata', async () => {
    const input = `
          function Counter() {
            return <div>Counter</div>;
          }
          function App() {
             function Counter1() {
              function Counter2() {
                return <div>Counter</div>;
              }
              return <div>Counter</div>;
            }
            return <div>
              <Counter />
            </div>;
          }
          createApp(App, 'root');
    `;

    const output = await transform(input);

    expect(output).toContain('Counter.__signature');
    expect(output).toContain('App.__signature');
    expect(output).not.toContain('Counter1.__signature');
    expect(output).not.toContain('Counter2.__signature');
    expect(output).toContain('const __$registry$__ = [Counter, App];');
  });

  it('should add HMR metadata to components', async () => {
    const input = `
          import { createComponent } from 'essor';
          function App() {
            return <div>Hello</div>;
          }
    `;

    const output = await transform(input);

    expect(output).toMatchSnapshot();
  });

  it('should transform createApp to create with HMR component', async () => {
    const input = `
          import { createApp } from 'essor';
          function App() {
            return <div>Hello</div>;
          }
          createApp(App, 'root');
    `;

    const output = await transform(input);

    expect(output).toMatchSnapshot();
  });

  it('wraps imported root and child components for split-file HMR', async () => {
    const input = `
          import { createApp } from 'essor';
          import { App } from './App';
          import { CounterPanel } from './CounterPanel';

          function Shell() {
            return <main>
              <CounterPanel />
            </main>;
          }

          createApp(App, 'root');
    `;

    const output = await transform(input);

    expect(output).toContain("createApp(__$createHMRComponent$__(App), 'root');");
    expect(output).toContain('_insert$(_root$, __$createHMRComponent$__(CounterPanel, {})');
  });

  it('should not transform when HMR is disabled', async () => {
    const input = `
          import { createComponent as cc } from 'essor';
          function App() {
            return <div>Hello</div>;
          }
          cc(App);
    `;

    const output = await transform(input, false);

    expect(output).toMatchSnapshot();
  });

  describe('signature stability', () => {
    const componentSource = `
          function App() {
            return <div>Hello</div>;
          }
    `;

    it('produces a deterministic signature across repeated transforms', async () => {
      const first = await transform(componentSource);
      const second = await transform(componentSource);

      expect(extractSignature(first, 'App')).toBeDefined();
      expect(extractSignature(first, 'App')).toBe(extractSignature(second, 'App'));
    });

    it('ignores whitespace and indentation differences', async () => {
      const formatted = `
          function App() {
            return <div>Hello</div>;
          }
      `;
      const minified = `function App(){return <div>Hello</div>;}`;

      expect(extractSignature(await transform(formatted), 'App')).toBe(
        extractSignature(await transform(minified), 'App'),
      );
    });

    it('changes the signature when the function body changes', async () => {
      const original = `function App() { return <div>Hello</div>; }`;
      const modified = `function App() { return <div>Goodbye</div>; }`;

      expect(extractSignature(await transform(original), 'App')).not.toBe(
        extractSignature(await transform(modified), 'App'),
      );
    });

    it('uses only the basename so absolute paths stay stable across machines', async () => {
      const a = await transform(componentSource, true, '/home/alice/project/src/App.tsx');
      const b = await transform(componentSource, true, '/var/ci/build/123/src/App.tsx');

      expect(extractSignature(a, 'App')).toBeDefined();
      expect(extractSignature(a, 'App')).toBe(extractSignature(b, 'App'));
    });

    it('incorporates the basename so same code in different files differs', async () => {
      const a = await transform(componentSource, true, 'App.tsx');
      const b = await transform(componentSource, true, 'Other.tsx');

      expect(extractSignature(a, 'App')).not.toBe(extractSignature(b, 'App'));
    });

    it('produces identical signatures for function declarations and arrow components', async () => {
      const declaration = `function App() { return <div>Hello</div>; }`;
      const arrow = `const App = () => { return <div>Hello</div>; };`;

      expect(extractSignature(await transform(declaration), 'App')).toBe(
        extractSignature(await transform(arrow), 'App'),
      );
    });
  });
});
