import { describe, expect, it } from 'vitest';
import { transformAsync } from '@babel/core';
import pluginFactory from '../../src';

describe('hMR transformation', () => {
  const transform = async (code: string, hmr = true) => {
    const result = await transformAsync(code, {
      plugins: [[pluginFactory, { hmr, bundler: 'vite' }]],
      filename: 'test.tsx',
      parserOpts: {
        plugins: ['jsx', 'typescript'],
      },
    });
    return result?.code || '';
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
});
