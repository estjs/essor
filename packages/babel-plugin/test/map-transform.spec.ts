import { describe, expect, it } from 'vitest';
import { transform } from '@babel/core';
import babelPlugin from '../src/index';

const transformCode = (code: string, options: any = { enableFor: true }) => {
  const result = transform(code, {
    configFile: false,
    plugins: [[babelPlugin, { mode: 'client', ...options }]],
  });
  return result?.code || '';
};

describe('map Transformation', () => {
  it('transforms list.map() to createComponent(For)', () => {
    const input = `
      function App() {
        const list = ['a', 'b'];
        return <div>{list.map(item => <span>{item}</span>)}</div>;
      }
    `;

    const output = transformCode(input);
    // For is wrapped in createComponent
    expect(output).toContain('_createComponent$');
    expect(output).toContain('_For$');
    // Check for correct props structure: { each: () => list, children: ... }
    expect(output).toMatch(/each:\s*\(\)\s*=>\s*list/);
  });

  it('transforms signal.value.map() to createComponent(For)', () => {
    const input = `
      function App() {
        const list = signal([]);
        return <div>{list.value.map(item => <span>{item}</span>)}</div>;
      }
    `;
    const output = transformCode(input);
    // For is wrapped in createComponent
    expect(output).toContain('_createComponent$');
    expect(output).toContain('_For$');
    // Should wrap accessor around list.value
    expect(output).toMatch(/each:\s*\(\)\s*=>\s*list\.value/);
  });

  it('transforms JSX element in map to direct function call', () => {
    const input = `
      function App() {
        const list = [{id: 1}, {id: 2}];
        return <div>{list.map(item => <Row key={item.id} item={item} />)}</div>;
      }
    `;
    const output = transformCode(input);
    // Should extract keyFn
    expect(output).toMatch(/keyFn:\s*item\s*=>\s*item\.id/);
    // Should transform <Row /> to Row() direct call
    expect(output).not.toContain('_createComponent$(Row');
    expect(output).toContain('Row({');
  });

  it('does not transform if no map call', () => {
    const input = `
        function App() {
            return <div>{someVar}</div>
        }
      `;
    const output = transformCode(input);
    expect(output).not.toContain('_For$');
  });

  describe('enableFor option', () => {
    it('disables transformation when set to false', () => {
      const input = `
        function App() {
          const list = ['a', 'b'];
          return <div>{list.map(item => <span>{item}</span>)}</div>;
        }
      `;

      const output = transformCode(input, { enableFor: false });
      // Should NOT contain For component
      expect(output).not.toContain('_For$');
      // Should still contain map call
      expect(output).toContain('list.map');
    });

    it('enables transformation when set to true', () => {
      const input = `
        function App() {
          const list = ['a', 'b'];
          return <div>{list.map(item => <span>{item}</span>)}</div>;
        }
      `;

      const output = transformCode(input, { enableFor: true });
      // Should contain For component
      expect(output).toContain('_For$');
      expect(output).toContain('_createComponent$');
    });
  });
});
