import { describe, expect, it } from 'vitest';
import { transformAsync } from '@babel/core';
import pluginFactory from '../../src';

describe('hMR transformation', () => {
  const transform = async (code: string, hmr = true) => {
    const result = await transformAsync(code, {
      plugins: [[pluginFactory, { hmr }]],
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
            return <div>
              <Counter />
            </div>;
          }
          createApp(App, 'root');
    `;

    const output = await transform(input);

    expect(output).toMatchSnapshot();
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
