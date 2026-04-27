// @vitest-environment node
import babel, { types as t } from '@babel/core';
import generate from '@babel/generator';
import traverse, { type NodePath } from '@babel/traverse';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createCompileContext,
  createImportIdentifiers,
  registerDeclaration,
  registerTemplate,
  setCompileContext,
} from '../src/context';
import { UPDATE_PREFIX } from '../src/constants';
import { buildComponentPropsExpression } from '../src/jsx/component-props';
import { type IRComponent, IRType, buildIR } from '../src/jsx/ir';
import { resolveOptions } from '../src/options';
import { applyHmr, collectTopLevelHmrComponents } from '../src/plugins/hmr';
import {
  isMemberAccessingProperty,
  isSignal,
  symbolAssignment,
  symbolUpdate,
  transformSymbol,
} from '../src/plugins/symbol';

function getProgramPath(code: string): NodePath<t.Program> {
  const ast = babel.parseSync(code, {
    sourceType: 'module',
    parserOpts: {
      plugins: ['jsx', 'typescript'],
    },
  });

  if (!ast) {
    throw new Error('Failed to parse test program');
  }

  let programPath: NodePath<t.Program> | undefined;
  traverse(ast, {
    Program(path) {
      programPath = path;
      path.stop();
    },
  });

  if (!programPath) {
    throw new Error('Program path not found');
  }

  return programPath;
}

afterEach(() => {
  setCompileContext(null);
});

describe('babel plugin direct helpers', () => {
  describe('iR builder', () => {
    it('classifies native element attrs into events, refs, bindings, spreads, and children', () => {
      const programPath = getProgramPath(`
        const view = (
          <button id="save" onClick={handleClick} ref={capture} bind:value={model} {...rest}>
            hello {count}
          </button>
        );
      `);
      const ctx = createCompileContext(
        resolveOptions({ mode: 'client', delegateEvents: true }, 'ir-element.tsx'),
        programPath,
      );

      let jsxPath: NodePath<t.JSXElement> | undefined;
      programPath.traverse({
        JSXElement(path) {
          jsxPath = path;
          path.stop();
        },
      });

      if (!jsxPath) {
        throw new Error('JSX element path not found');
      }

      const ir = buildIR(jsxPath, ctx);
      expect(ir.type).toBe(IRType.ELEMENT);
      if (ir.type !== IRType.ELEMENT) {
        throw new Error('Expected native element IR');
      }

      expect(ir.staticAttrs).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'id', value: 'save' })]),
      );
      expect(ir.events).toHaveLength(1);
      expect(ir.events[0]).toMatchObject({ name: 'click', delegated: true });
      expect(t.isIdentifier(ir.ref?.value, { name: 'capture' })).toBe(true);
      expect(ir.binds).toEqual([expect.objectContaining({ name: 'value' })]);
      expect(ir.spreads).toHaveLength(1);
      expect(ctx.delegateEvents.has('click')).toBe(true);
      expect(ir.children.map(child => child.type)).toEqual([IRType.TEXT, IRType.EXPRESSION]);
    });

    it('lowers component bindings and map children into component and for IR nodes', () => {
      const programPath = getProgramPath(`
        const view = (
          <Widget onClick={handleClick} bind:model={form} {...extra}>
            {items.map((item, index) => <li key={item.id}>{item.label}</li>)}
          </Widget>
        );
      `);
      const ctx = createCompileContext(
        resolveOptions({ mode: 'client' }, 'ir-component.tsx'),
        programPath,
      );

      let jsxPath: NodePath<t.JSXElement> | undefined;
      programPath.traverse({
        JSXElement(path) {
          jsxPath = path;
          path.stop();
        },
      });

      if (!jsxPath) {
        throw new Error('JSX element path not found');
      }

      const ir = buildIR(jsxPath, ctx);
      expect(ir.type).toBe(IRType.COMPONENT);
      if (ir.type !== IRType.COMPONENT) {
        throw new Error('Expected component IR');
      }

      expect(ir.props.map(prop => prop.name)).toEqual(
        expect.arrayContaining(['onClick', `${UPDATE_PREFIX}:model`]),
      );
      expect(ir.spreads).toHaveLength(1);
      expect(ir.children).toHaveLength(1);
      expect(ir.children[0]?.type).toBe(IRType.FOR);

      const forChild = ir.children[0];
      if (!forChild || forChild.type !== IRType.FOR) {
        throw new Error('Expected map child to lower into IRFor');
      }

      expect(t.isIdentifier(forChild.itemParam, { name: 'item' })).toBe(true);
      expect(t.isIdentifier(forChild.indexParam, { name: 'index' })).toBe(true);
      expect(t.isMemberExpression(forChild.key)).toBe(true);
      expect(forChild.body.type).toBe(IRType.ELEMENT);
    });
  });

  describe('context helpers', () => {
    it('maps helper identifiers according to render mode', () => {
      const path = getProgramPath('const value = 1;');

      const serverIds = createImportIdentifiers(path, 'server');
      const hydrateIds = createImportIdentifiers(path, 'hydrate');
      const clientIds = createImportIdentifiers(path, 'client');

      expect(serverIds.createComponent.name).toContain('createSSGComponent');
      expect(serverIds.patchAttr.name).toContain('setSSGAttr');
      expect(hydrateIds.template.name).toContain('getRenderedElement');
      expect(hydrateIds.patchStyle.name).toContain('patchStyleHydrate');
      expect(clientIds.template.name).toContain('template');
    });

    it('dedupes cached templates and serializable declarations only', () => {
      const path = getProgramPath('const existing = 1;');
      createCompileContext(resolveOptions({ mode: 'client' }, 'context.tsx'), path);

      const templateA = registerTemplate('<div>hello</div>');
      const templateB = registerTemplate('<div>hello</div>');
      const serializableA = registerDeclaration(t.arrayExpression([t.stringLiteral('a')]));
      const serializableB = registerDeclaration(t.arrayExpression([t.stringLiteral('a')]));
      const dynamicA = registerDeclaration(t.arrayExpression([t.identifier('value')]));
      const dynamicB = registerDeclaration(t.arrayExpression([t.identifier('value')]));

      expect(templateA).toBe(templateB);
      expect(serializableA).toBe(serializableB);
      expect(dynamicA).not.toBe(dynamicB);
    });
  });

  describe('symbol helpers', () => {
    it('detects .value member access and custom signal prefixes', () => {
      const dotAccess = t.memberExpression(t.identifier('count'), t.identifier('value'));
      const computedAccess = t.memberExpression(
        t.identifier('count'),
        t.stringLiteral('value'),
        true,
      );

      const path = getProgramPath('const sigCount = 1;');
      createCompileContext(
        resolveOptions({ mode: 'client', signalPrefix: 'sig' }, 'symbol.tsx'),
        path,
      );

      expect(isMemberAccessingProperty(dotAccess, 'value')).toBe(true);
      expect(isMemberAccessingProperty(computedAccess, 'value')).toBe(true);
      expect(isSignal('sigCount')).toBe(true);
      expect(isSignal('$count')).toBe(false);
    });

    it('rewrites signal reads and declarations without touching object keys or existing .value access', () => {
      const path = getProgramPath(`
        const sigCount = 1;
        const sigComputed = () => sigCount;
        const obj = { sigCount: 1 };
        sigCount;
        sigCount.value;
        obj.sigCount;
      `);

      createCompileContext(
        resolveOptions({ mode: 'client', signalPrefix: 'sig' }, 'symbol.tsx'),
        path,
      );
      transformSymbol(path);

      const code = generate(path.node).code;
      expect(code).toMatch(/const sigCount = .*signal.*\(1\);/);
      expect(code).toMatch(/const sigComputed = .*computed.*\(\(\) => sigCount\.value\);/);
      expect(code).toContain('sigCount: 1');
      expect(code).toContain('obj.sigCount;');
      expect(code).not.toContain('sigCount.value.value');
    });

    it('rewrites signal assignments and updates without double-wrapping existing .value access', () => {
      const path = getProgramPath(`
        let sigCount = 0;
        sigCount = 1;
        ++sigCount;
        sigCount.value = 2;
        sigCount.value++;
      `);

      createCompileContext(
        resolveOptions({ mode: 'client', signalPrefix: 'sig' }, 'symbol-assign.tsx'),
        path,
      );

      const assignmentPaths: Array<NodePath<t.AssignmentExpression>> = [];
      const updatePaths: Array<NodePath<t.UpdateExpression>> = [];
      path.traverse({
        AssignmentExpression(assignmentPath) {
          assignmentPaths.push(assignmentPath);
        },
        UpdateExpression(updatePath) {
          updatePaths.push(updatePath);
        },
      });

      symbolAssignment(assignmentPaths[0]!);
      symbolUpdate(updatePaths[0]!);
      symbolAssignment(assignmentPaths[1]!);
      symbolUpdate(updatePaths[1]!);

      const code = generate(path.node).code;
      expect(code).toContain('sigCount.value = 1;');
      expect(code).toContain('++sigCount.value;');
      expect(code).toContain('sigCount.value = 2;');
      expect(code).toContain('sigCount.value++;');
      expect(code).not.toContain('value.value');
    });
  });

  describe('component props builder', () => {
    it('builds dynamic props as getters while keeping event handlers as plain properties', () => {
      const node: IRComponent = {
        type: IRType.COMPONENT,
        tag: 'Widget',
        props: [
          {
            name: 'value',
            value: t.identifier('count'),
            kind: 'dynamic',
          },
          {
            name: 'onClick',
            value: t.identifier('handleClick'),
            kind: 'dynamic',
          },
        ],
        spreads: [
          {
            value: t.identifier('extraProps'),
            kind: 'dynamic',
          },
        ],
        children: [],
      };

      const expression = buildComponentPropsExpression(node, {
        dynamicPropsAsGetters: true,
      });
      const code = generate(expression).code;

      expect(code).toContain('Object.assign');
      expect(code).toContain('get value()');
      expect(code).toContain('onClick: handleClick');
      expect(code).toContain('extraProps');
    });

    it('adds lazy children getters on top of an Object.assign props expression', () => {
      const node: IRComponent = {
        type: IRType.COMPONENT,
        tag: 'Widget',
        props: [],
        spreads: [
          {
            value: t.identifier('extraProps'),
            kind: 'dynamic',
          },
        ],
        children: [],
      };

      const expression = buildComponentPropsExpression(node, {
        dynamicPropsAsGetters: true,
        lazyChildren: true,
        renderedChildren: [t.stringLiteral('child')],
      });
      const code = generate(expression).code;

      expect(code).toContain('Object.assign');
      expect(code).toContain('get children()');
      expect(code).toContain('["child"]');
    });
  });

  describe('hmr helpers', () => {
    it('collects top-level JSX components and injects metadata/registry code', () => {
      const path = getProgramPath(`
        export function Counter() {
          return <div />;
        }

        const Widget = () => <span />;

        function Helper() {
          function Nested() {
            return <em />;
          }
          return 1;
        }

        createApp(Counter);
      `);
      const ctx = createCompileContext(
        resolveOptions(
          {
            mode: 'client',
            hmr: true,
            bundler: 'vite',
          },
          'Counter.tsx',
        ),
        path,
      );

      collectTopLevelHmrComponents(path, ctx);

      expect(ctx.hmrComponents.has('Counter')).toBe(true);
      expect(ctx.hmrComponents.has('Widget')).toBe(true);
      expect(ctx.hmrComponents.has('Nested')).toBe(false);

      applyHmr(path, ctx);

      const code = generate(path.node).code;
      expect(code).toContain('Counter.__signature');
      expect(code).toContain('Widget.__hmrId');
      expect(code).toContain('const __$registry$__ = [Counter, Widget];');
      expect(code).toContain('createApp(__$createHMRComponent$__(Counter));');
      expect(code).not.toContain('Nested.__hmrId');
    });
  });
});
