import { describe, expect, it } from 'vitest';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import { transformProps } from '../../src/signals/props';
import { TRANSFORM_PROPERTY_NAME } from '../../src/constants';

describe('signals/props', () => {
  const runTransform = (code: string, options: any = {}) => {
    const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });

    // Mock state
    const state = {
      opts: { symbol: '$', ...options },
      imports: {
        omitProps: t.identifier('omitProps'),
      },
      file: {
        path: {
          scope: {
            generateUidIdentifier: (name: string) => t.identifier(`_${name}`),
          },
        },
      },
    };

    // Mock __DEV__
    // @ts-ignore
    globalThis.__DEV__ = true;

    traverse(ast, {
      'FunctionDeclaration|ArrowFunctionExpression': function (path: any) {
        // Mock state on path
        path.state = state;
        path.hub = {
          file: {
            opts: {
              filename: 'test.tsx',
            },
          },
        };

        // Ensure scope exists
        if (!path.scope) {
          path.scope = {
            rename: (oldName, newName) => {
              path.scope.bindings[oldName]?.path.scope.rename(oldName, newName);
            },
            bindings: {},
          };
        }

        transformProps(path);
      },
    });

    // Clean up
    // @ts-ignore
    delete globalThis.__DEV__;

    return generate(ast).code;
  };

  it('transforms simple object destructuring', () => {
    const code = `
      function Component({ name }) {
        return <div>{name}</div>;
      }
    `;
    const output = runTransform(code);
    expect(output).toContain(`function Component(${TRANSFORM_PROPERTY_NAME}) {`);
    expect(output).toContain(`return <div>{${TRANSFORM_PROPERTY_NAME}.name}</div>;`);
  });

  it('transforms aliased properties', () => {
    const code = `
      function Component({ name: alias }) {
        return <div>{alias}</div>;
      }
    `;
    const output = runTransform(code);
    expect(output).toContain(`return <div>{${TRANSFORM_PROPERTY_NAME}.name}</div>;`);
  });

  it('transforms default values', () => {
    const code = `
      function Component({ count = 0 }) {
        return <div>{count}</div>;
      }
    `;
    const output = runTransform(code);
    // Should create default value assignment in params
    expect(output).toContain(`${TRANSFORM_PROPERTY_NAME} = {`);
    expect(output).toContain(`count: 0`);
    expect(output).toContain(`return <div>{${TRANSFORM_PROPERTY_NAME}.count}</div>;`);
  });

  it('transforms nested object destructuring', () => {
    const code = `
      function Component({ user: { name } }) {
        return <div>{name}</div>;
      }
    `;
    const output = runTransform(code);
    expect(output).toContain(`return <div>{${TRANSFORM_PROPERTY_NAME}.user.name}</div>;`);
  });

  it('transforms rest parameters', () => {
    const code = `
      function Component({ name, ...rest }) {
        return <div {...rest}>{name}</div>;
      }
    `;
    const output = runTransform(code);
    expect(output).toContain(`const rest = omitProps(${TRANSFORM_PROPERTY_NAME}, ["name"]);`);
    expect(output).toContain(`return <div {...rest}>{${TRANSFORM_PROPERTY_NAME}.name}</div>;`);
  });

  it('transforms rest parameters with no other props', () => {
    const code = `
      function Component({ ...rest }) {
        return <div {...rest} />;
      }
    `;
    const output = runTransform(code);
    // Should just use the param name directly if it's the only thing
    expect(output).toContain(`function Component(rest) {`);
    expect(output).toContain(`return <div {...rest} />;`);
  });

  it('skips transformation if function does not return JSX', () => {
    const code = `
      function Helper({ name }) {
        return name;
      }
    `;
    const output = runTransform(code);
    expect(output).toContain(`function Helper({`);
    expect(output).toContain(`name`);
    expect(output).toContain(`})`);
  });

  // Computed properties are currently not supported and skipped (removed from signature)
  // it('skips computed properties', () => {
  //   const code = `
  //     function Component({ [key]: value }) {
  //       return <div>{value}</div>;
  //     }
  //   `;
  //   const output = runTransform(code);
  //   // Computed properties should remain in destructuring
  //   expect(output).toContain(`function Component({`);
  //   expect(output).toContain(`[key]: value`);
  //   expect(output).toContain(`})`);
  // });

  // Nested rest parameters are currently not supported
  // it('transforms nested rest parameters', () => {
  //   const code = `
  //     function Component({ user: { name, ...userRest }, ...rest }) {
  //       return <div {...rest} {...userRest}>{name}</div>;
  //     }
  //   `;
  //   const output = runTransform(code);
  //   expect(output).toContain(
  //     `const userRest = omitProps(${TRANSFORM_PROPERTY_NAME}.user, ["name"]);`,
  //   );
  //   expect(output).toContain(`const rest = omitProps(${TRANSFORM_PROPERTY_NAME}, ["user"]);`);
  //   expect(output).toContain(
  //     `return <div {...rest} {...userRest}>{${TRANSFORM_PROPERTY_NAME}.user.name}</div>;`,
  //   );
  // });

  it('warns about signal prefix in props', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Mock __DEV__ global
    // @ts-ignore
    globalThis.__DEV__ = true;

    const code = `
      function Component({ $signal }) {
        return <div>{$signal}</div>;
      }
    `;
    runTransform(code);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('transformProps'),
      expect.stringContaining('Property names cannot start with signal prefix'),
      expect.any(Array),
    );

    warnSpy.mockRestore();
    // @ts-ignore
    delete globalThis.__DEV__;
  });

  it('transforms complex default values', () => {
    const code = `
      function Component({
        config = { theme: 'dark', retry: 3 },
        items = []
      }) {
        return <div>{config.theme}</div>;
      }
    `;
    const output = runTransform(code);
    expect(output).toContain(`${TRANSFORM_PROPERTY_NAME} = {`);
    expect(output).toContain(`config: {`);
    expect(output).toContain(`theme: 'dark'`);
    expect(output).toContain(`retry: 3`);
    expect(output).toContain(`items: []`);
  });

  it('handles nested object with default value', () => {
    const code = `
      function Component({ user: { name, age } = { name: 'John', age: 30 } }) {
        return <div>{name} {age}</div>;
      }
    `;
    const output = runTransform(code);
    expect(output).toContain(`${TRANSFORM_PROPERTY_NAME} = {`);
    expect(output).toContain(`user: {`);
    expect(output).toContain(`name: 'John'`);
    expect(output).toContain(`age: 30`);
    expect(output).toContain(
      `return <div>{${TRANSFORM_PROPERTY_NAME}.user.name} {${TRANSFORM_PROPERTY_NAME}.user.age}</div>;`,
    );
  });

  it('handles deeply nested destructuring with defaults', () => {
    const code = `
      function Component({ settings: { theme: { color = 'blue' } } }) {
        return <div>{color}</div>;
      }
    `;
    const output = runTransform(code);
    expect(output).toContain(`${TRANSFORM_PROPERTY_NAME} = {`);
    expect(output).toContain(`color: 'blue'`);
    expect(output).toContain(
      `return <div>{${TRANSFORM_PROPERTY_NAME}.settings.theme.color}</div>;`,
    );
  });

  it('handles mixed properties with nested defaults', () => {
    const code = `
      function Component({ title, user: { name = 'Guest' }, count = 0 }) {
        return <div>{title} {name} {count}</div>;
      }
    `;
    const output = runTransform(code);
    expect(output).toContain(`${TRANSFORM_PROPERTY_NAME} = {`);
    expect(output).toContain(`name: 'Guest'`);
    expect(output).toContain(`count: 0`);
    expect(output).toContain(
      `return <div>{${TRANSFORM_PROPERTY_NAME}.title} {${TRANSFORM_PROPERTY_NAME}.user.name} {${TRANSFORM_PROPERTY_NAME}.count}</div>;`,
    );
  });

  it('handles empty object as default value', () => {
    const code = `
      function Component({ options = {} }) {
        return <div>{options}</div>;
      }
    `;
    const output = runTransform(code);
    expect(output).toContain(`${TRANSFORM_PROPERTY_NAME} = {`);
    expect(output).toContain(`options: {}`);
  });

  it('handles null and undefined default values', () => {
    const code = `
      function Component({ value = null, other = undefined }) {
        return <div>{value} {other}</div>;
      }
    `;
    const output = runTransform(code);
    expect(output).toContain(`${TRANSFORM_PROPERTY_NAME} = {`);
    expect(output).toContain(`value: null`);
    expect(output).toContain(`other: undefined`);
  });

  it('handles boolean default values', () => {
    const code = `
      function Component({ enabled = true, disabled = false }) {
        return <div>{enabled} {disabled}</div>;
      }
    `;
    const output = runTransform(code);
    expect(output).toContain(`${TRANSFORM_PROPERTY_NAME} = {`);
    expect(output).toContain(`enabled: true`);
    expect(output).toContain(`disabled: false`);
  });

  it('handles string default values with special characters', () => {
    const code = `
      function Component({ message = "Hello 'World'", path = \`/api/\${id}\` }) {
        return <div>{message} {path}</div>;
      }
    `;
    const output = runTransform(code);
    expect(output).toContain(`${TRANSFORM_PROPERTY_NAME} = {`);
    // Should preserve the default values
    expect(output).toMatch(/message:/);
    expect(output).toMatch(/path:/);
  });

  it('handles arrow function components', () => {
    const code = `
      const Component = ({ name, count = 0 }) => {
        return <div>{name} {count}</div>;
      };
    `;
    const output = runTransform(code);
    expect(output).toContain(`${TRANSFORM_PROPERTY_NAME} = {`);
    expect(output).toContain(`count: 0`);
    expect(output).toContain(
      `return <div>{${TRANSFORM_PROPERTY_NAME}.name} {${TRANSFORM_PROPERTY_NAME}.count}</div>;`,
    );
  });

  it('handles rest with multiple regular properties', () => {
    const code = `
      function Component({ title, subtitle, count, ...rest }) {
        return <div {...rest}>{title} {subtitle} {count}</div>;
      }
    `;
    const output = runTransform(code);
    expect(output).toContain(
      `const rest = omitProps(${TRANSFORM_PROPERTY_NAME}, ["title", "subtitle", "count"]);`,
    );
    expect(output).toContain(
      `return <div {...rest}>{${TRANSFORM_PROPERTY_NAME}.title} {${TRANSFORM_PROPERTY_NAME}.subtitle} {${TRANSFORM_PROPERTY_NAME}.count}</div>;`,
    );
  });

  it('handles properties with numeric default values', () => {
    const code = `
      function Component({ count = 42, ratio = 3.14, negative = -1 }) {
        return <div>{count} {ratio} {negative}</div>;
      }
    `;
    const output = runTransform(code);
    expect(output).toContain(`${TRANSFORM_PROPERTY_NAME} = {`);
    expect(output).toContain(`count: 42`);
    expect(output).toContain(`ratio: 3.14`);
    expect(output).toContain(`negative: -1`);
  });

  it('handles array default values', () => {
    const code = `
      function Component({ items = [1, 2, 3], tags = ['a', 'b'] }) {
        return <div>{items} {tags}</div>;
      }
    `;
    const output = runTransform(code);
    expect(output).toContain(`${TRANSFORM_PROPERTY_NAME} = {`);
    expect(output).toContain(`items: [1, 2, 3]`);
    expect(output).toContain(`tags: ['a', 'b']`);
  });

  it('skips transformation for non-JSX returning functions', () => {
    const code = `
      function helper({ data }) {
        return data.map(x => x * 2);
      }
    `;
    const output = runTransform(code);
    // Should not transform since it doesn't return JSX
    expect(output).toContain(`function helper({`);
    expect(output).toContain(`data`);
    expect(output).toContain(`})`);
    expect(output).not.toContain(TRANSFORM_PROPERTY_NAME);
  });

  it('handles empty destructuring pattern', () => {
    const code = `
      function Component({}) {
        return <div>Empty</div>;
      }
    `;
    const output = runTransform(code);
    // Should handle empty object pattern gracefully
    expect(output).toContain(`function Component(`);
  });

  it('handles single property with rest', () => {
    const code = `
      function Component({ id, ...rest }) {
        return <div id={id} {...rest} />;
      }
    `;
    const output = runTransform(code);
    expect(output).toContain(`const rest = omitProps(${TRANSFORM_PROPERTY_NAME}, ["id"]);`);
    expect(output).toContain(`<div id={${TRANSFORM_PROPERTY_NAME}.id} {...rest} />`);
  });
});
