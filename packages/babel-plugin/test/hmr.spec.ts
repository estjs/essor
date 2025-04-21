/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { getTransform } from './transform';

describe('hMR Transformation', () => {
  it('should wrap root component with HMR wrapper', () => {
    const code = `
      function App({ title }) {
        return <div>{title}</div>;
      }

      export default function Container() {
        return <App title="Hello World" />;
      }
    `;

    const transform = getTransform('jsx', { mode: 'client' });
    const result = transform(code);

    // Verify transformed code contains createHMR call
    expect(result).toContain('createHMR$');
    expect(result).toContain('acceptHMR$');

    // Verify transformed code contains App component
    expect(result).toContain('App');

    // Verify props are correctly passed - updated string match format
    expect(result).toContain('"title": "Hello World"');
  });

  it('should not apply HMR wrapper in SSR mode', () => {
    const code = `
      function App({ title }) {
        return <div>{title}</div>;
      }

      export default function Container() {
        return <App title="Hello World" />;
      }
    `;

    const transform = getTransform('jsx', { mode: 'ssr' });
    const result = transform(code);

    // In SSR mode, should not contain HMR related functions
    expect(result).not.toContain('createHMR$');
    expect(result).not.toContain('acceptHMR$');
  });

  it('should not apply HMR wrapper to DOM elements', () => {
    const code = `
      export default function Container() {
        return <div>Hello World</div>;
      }
    `;

    const transform = getTransform('jsx', { mode: 'client' });
    const result = transform(code);

    // Regular DOM elements should not be wrapped with HMR
    expect(result).not.toContain('createHMR$');
    expect(result).not.toContain('acceptHMR$');
  });

  it('should handle complex component with dynamic props in HMR', () => {
    const code = `
      function App({ items }) {
        return (
          <div>
            {items.map(item => <Item key={item.id} {...item} />)}
          </div>
        );
      }

      export default function Container() {
        const data = [{id: 1, name: 'Item 1'}, {id: 2, name: 'Item 2'}];
        return <App items={data} />;
      }
    `;

    const transform = getTransform('jsx', { mode: 'client' });
    const result = transform(code);

    // Verify HMR wrapping for complex components
    expect(result).toContain('createHMR$');
    expect(result).toContain('acceptHMR$');

    // Verify dynamic props - updated string match format
    expect(result).toContain('"items": data');
  });

  it('should not apply HMR wrapper when hmr option is disabled', () => {
    const code = `
      function App({ title }) {
        return <div>{title}</div>;
      }

      export default function Container() {
        return <App title="Hello World" />;
      }
    `;

    const transform = getTransform('jsx', { mode: 'client', hmr: false });
    const result = transform(code);

    // When hmr option is false, should not contain HMR related functions
    expect(result).not.toContain('createHMR$');
    expect(result).not.toContain('acceptHMR$');
  });
});
