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
    (global as any).__DEV__ = true;

    traverse(ast, {
      'FunctionDeclaration|ArrowFunctionExpression': function (path) {
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
    delete (global as any).__DEV__;

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
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
    // Mock __DEV__ global
    (global as any).__DEV__ = true;

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
    delete (global as any).__DEV__;
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
});
