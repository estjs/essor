// @vitest-environment node

// Mock global flags used in context.ts
import * as babel from '@babel/core';
import { types as t } from '@babel/core';
import generate from '@babel/generator';
import traverse, { type NodePath } from '@babel/traverse';
import { describe, expect, it } from 'vitest';
import { createContext } from '../src/context';
import { parseJSX } from '../src/parse';
import { buildComponentProps, getDynamicAnchorKind } from '../src/generate/client';
import { applyHmr, collectTopLevelHmrComponents, isSignal, transformSignals, transformMapToFor } from '../src/transform';
import { isMemberAccessingProperty } from '../src/utils/dom';
import type { IRElement, IRNode } from '../src/types';

globalThis.__DEV__ = true;
globalThis.__TEST__ = true;

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
      const ctx = createContext(programPath, 'ir-element.tsx', {
        mode: 'client',
        delegateEvents: true,
      } as any);

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

      const ir = parseJSX(jsxPath.node, ctx, false, jsxPath) as IRElement;
      expect(ir.type).toBe('element');
      if (ir.type !== 'element') {
        throw new Error('Expected native element IR');
      }

      expect(ir.props.static).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'id' })]),
      );
      expect(ir.props.events).toHaveLength(1);
      expect(ir.props.events[0]).toMatchObject({ name: 'onClick' });
      expect(t.isIdentifier(ir.props.ref?.value, { name: 'capture' })).toBe(true);
      expect(ir.props.binds).toEqual([expect.objectContaining({ name: 'value' })]);
      expect(ir.props.spreads).toHaveLength(1);
      expect(ctx.delegatedEvents.has('click')).toBe(true);
      expect(ir.children.map((child) => child.type)).toEqual(['text', 'expression']);
    });

    it('lowers component bindings and map children into component and for IR nodes', () => {
      const programPath = getProgramPath(`
        const view = (
          <Widget onClick={handleClick} bind:model={form} {...extra}>
            {items.map((item, index) => <li key={item.id}>{item.label}</li>)}
          </Widget>
        );
      `);
      const ctx = createContext(programPath, 'ir-component.tsx', { mode: 'client' });
      transformMapToFor(programPath, ctx);

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

      const ir = parseJSX(jsxPath.node, ctx, false, jsxPath) as IRElement;
      expect(ir.type).toBe('element');
      if (ir.type !== 'element') {
        throw new Error('Expected component IR');
      }

      expect(ir.isComponent).toBe(true);
      expect(ir.props.dynamic.map((prop) => prop.name)).toEqual(
        expect.arrayContaining(['onClick', 'model', 'update:model']),
      );
      expect(ir.props.spreads).toHaveLength(1);
      expect(ir.children).toHaveLength(1);

      const forChild = ir.children[0] as IRElement;
      if (!forChild || forChild.type !== 'element') {
        throw new Error('Expected map child to lower into For component');
      }

      expect(forChild.tag).toBe('For');
      expect(forChild.isComponent).toBe(true);
    });
  });

  describe('context helpers', () => {
    it('keeps omitClosingTags enabled by default and allows opting out', () => {
      const path = getProgramPath('const value = 1;');
      const ctxDefault = createContext(path, 'options.tsx', { mode: 'server' });
      expect(ctxDefault.options.omitClosingTags !== false).toBe(true);

      const ctxOptOut = createContext(path, 'options.tsx', {
        mode: 'server',
        omitClosingTags: false,
      });
      expect(ctxOptOut.options.omitClosingTags).toBe(false);
    });

    it('maps helper identifiers according to render mode', () => {
      const path = getProgramPath('const value = 1;');

      const serverCtx = createContext(path, 'server.tsx', { mode: 'server' });
      const hydrateCtx = createContext(path, 'hydrate.tsx', { mode: 'hydrate' });
      const clientCtx = createContext(path, 'client.tsx', { mode: 'client' });

      expect(serverCtx.imports.get('ssrComponent').name).toBe('_ssrComponent$');
      expect(serverCtx.imports.get('ssr').name).toBe('_ssr$');
      expect(serverCtx.imports.get('ssrAttrDynamic').name).toBe('_ssrAttrDynamic$');
      expect(hydrateCtx.imports.get('template').name).toBe('_getRenderedElement$');
      expect(hydrateCtx.imports.get('patchStyle').name).toBe('_patchStyleHydrate$');
      expect(clientCtx.imports.get('template').name).toBe('_template$');
    });

    it('dedupes cached templates and serializable declarations only', () => {
      const path = getProgramPath('const existing = 1;');
      const ctx = createContext(path, 'context.tsx', { mode: 'client' });

      const templateA = ctx.templates.register('<div>hello</div>', false);
      const templateB = ctx.templates.register('<div>hello</div>', false);

      expect(templateA).toBe(templateB);
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
      const ctx = createContext(path, 'symbol.tsx', { mode: 'client', signalPrefix: 'sig' });

      expect(isMemberAccessingProperty(dotAccess, 'value')).toBe(true);
      expect(isMemberAccessingProperty(computedAccess, 'value')).toBe(true);
      expect(isSignal('sigCount', ctx)).toBe(true);
      expect(isSignal('$count', ctx)).toBe(false);
    });

    it('detects .value across optional member expressions and rejects non-value keys', () => {
      const optionalDot = t.optionalMemberExpression(
        t.identifier('count'),
        t.identifier('value'),
        false,
        true,
      );
      const optionalComputed = t.optionalMemberExpression(
        t.identifier('count'),
        t.stringLiteral('value'),
        true,
        true,
      );
      const otherKey = t.memberExpression(t.identifier('count'), t.identifier('peek'));
      const numericKey = t.memberExpression(t.identifier('count'), t.numericLiteral(0), true);

      expect(isMemberAccessingProperty(optionalDot, 'value')).toBe(true);
      expect(isMemberAccessingProperty(optionalComputed, 'value')).toBe(true);
      expect(isMemberAccessingProperty(otherKey, 'value')).toBe(false);
      expect(isMemberAccessingProperty(numericKey, 'value')).toBe(false);
    });

    it('rewrites a signal used in a computed member key but leaves static keys alone', () => {
      const path = getProgramPath(`
        const sigKey = 'a';
        const obj = { sigKey: 1 };
        obj[sigKey];
        obj.sigKey;
      `);

      const ctx = createContext(path, 'symbol-key.tsx', { mode: 'client', signalPrefix: 'sig' });
      transformSignals(path, ctx);

      const code = generate(path.node).code;
      // Computed key is a read → `.value`; static key is a name → untouched.
      expect(code).toContain('obj[sigKey.value]');
      expect(code).toContain('obj.sigKey;');
      expect(code).toContain('sigKey: 1');
    });

    it('does not double-wrap an explicit optional .value read', () => {
      const path = getProgramPath(`
        const sigMaybe = null;
        sigMaybe?.value;
      `);

      const ctx = createContext(path, 'symbol-opt-read.tsx', {
        mode: 'client',
        signalPrefix: 'sig',
      });
      transformSignals(path, ctx);

      const code = generate(path.node).code;
      expect(code).toContain('sigMaybe?.value;');
      expect(code).not.toContain('value?.value');
      expect(code).not.toContain('value.value');
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

      const ctx = createContext(path, 'symbol.tsx', { mode: 'client', signalPrefix: 'sig' });
      transformSignals(path, ctx);

      const code = generate(path.node).code;
      expect(code).toMatch(/const sigCount = .*_signal\$.*\(1\);/);
      expect(code).toMatch(/const sigComputed = .*_computed\$.*\(\(\) => sigCount\.value\);/);
      expect(code).toContain('sigCount: 1');
      expect(code).toContain('obj.sigCount;');
      expect(code).not.toContain('sigCount.value.value');
    });

    it('rewrites signal assignments and updates without double-wrapping existing .value access', () => {
      const path = getProgramPath(`
        let sigCount = 0;
        let sigCount2 = 0;
        sigCount = 1;
        ++sigCount;
        sigCount2.value = 2;
        sigCount2.value++;
      `);

      const ctx = createContext(path, 'symbol-assign.tsx', { mode: 'client', signalPrefix: 'sig' });
      transformSignals(path, ctx);

      const code = generate(path.node).code;
      expect(code).toContain('sigCount.value = 1;');
      expect(code).toContain('++sigCount.value;');
      expect(code).toContain('sigCount2.value = 2;');
      expect(code).toContain('sigCount2.value++;');
      expect(code).not.toContain('value.value');
    });
  });

  describe('component props builder', () => {
    it('builds dynamic props as getters while keeping event handlers as plain properties', () => {
      const path = getProgramPath('const a = 1;');
      const ctx = createContext(path, 'test.tsx', { mode: 'client' });
      const node: IRElement = {
        type: 'element',
        tag: 'Widget',
        isComponent: true,
        isSVG: false,
        isDynamic: true,
        props: {
          static: [],
          dynamic: [
            {
              name: 'value',
              value: t.identifier('count'),
              order: 0,
            },
            {
              name: 'onClick',
              value: t.identifier('handleClick'),
              order: 1,
            },
          ],
          events: [],
          ref: null,
          spreads: [
            {
              value: t.identifier('extraProps'),
              order: 2,
            },
          ],
          binds: [],
        },
        children: [],
      };

      const expression = buildComponentProps(node, {
        dynamicPropsAsGetters: true,
        ctx,
      });
      const code = generate(expression).code;

      expect(code).toContain('Object.assign');
      expect(code).toContain('get value()');
      expect(code).toContain('onClick: handleClick');
      expect(code).toContain('extraProps');
    });

    it('adds lazy children getters on top of an Object.assign props expression', () => {
      const path = getProgramPath('const a = 1;');
      const ctx = createContext(path, 'test.tsx', { mode: 'client' });
      const node: IRElement = {
        type: 'element',
        tag: 'Widget',
        isComponent: true,
        isSVG: false,
        isDynamic: true,
        props: {
          static: [],
          dynamic: [],
          events: [],
          ref: null,
          spreads: [
            {
              value: t.identifier('extraProps'),
              order: 2,
            },
          ],
          binds: [],
        },
        children: [],
      };

      const expression = buildComponentProps(node, {
        dynamicPropsAsGetters: true,
        renderedChildren: [t.stringLiteral('child')],
        ctx,
      });
      const code = generate(expression).code;

      expect(code).toContain('Object.assign');
      expect(code).toContain('get children()');
      expect(code).toContain('["child"]');
    });
  });

  describe('hydration marker helpers', () => {
    it('classifies dynamic child anchors consistently by render mode', () => {
      const dynamic: IRNode = { type: 'expression', node: t.identifier('value'), isSignal: false };
      const element: IRNode = {
        type: 'element',
        tag: 'div',
        props: { static: [], dynamic: [], events: [], ref: null, spreads: [], binds: [] },
        children: [],
        isSVG: false,
        isComponent: false,
        isDynamic: false,
      };
      const text: IRNode = { type: 'text', value: 'label', isStatic: true };

      expect(getDynamicAnchorKind([dynamic], 0, 'hydrate')).toBe('tail');
      expect(getDynamicAnchorKind([dynamic, element], 0, 'hydrate')).toBe('element');
      expect(getDynamicAnchorKind([dynamic, text], 0, 'hydrate')).toBe('comment');
      expect(getDynamicAnchorKind([dynamic, element], 0, 'client')).toBe('comment');
    });
  });

  describe('hmr helpers', () => {
    it('adds top-level component HMR metadata and disposes top-level apps', () => {
      const path = getProgramPath(`
        import { createApp } from 'essor';

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
      const ctx = createContext(path, 'Counter.tsx', {
        mode: 'client',
        hmr: true,
        bundler: 'vite',
      } as any);

      collectTopLevelHmrComponents(path, ctx);

      expect((ctx as any).hmrComponents.has('Counter')).toBe(true);
      expect((ctx as any).hmrComponents.has('Widget')).toBe(true);
      expect((ctx as any).hmrComponents.has('Nested')).toBe(false);

      applyHmr(path, ctx);

      const code = generate(path.node).code;
      expect(code).toContain('Counter.__signature');
      expect(code).toContain('Counter.__hmrId');
      expect(code).toContain('Widget.__signature');
      expect(code).toContain('Widget.__hmrId');
      expect(code).toContain('const _app');
      expect(code).toContain('createApp(__$createHMRComponent$__(Counter))');
      expect(code).toContain('import.meta.hot?.dispose(() => _app?.unmount?.());');
      expect(code).not.toContain('Nested.__hmrId');
      expect(code).toContain('const __$registry$__ = [Counter, Widget];');
    });

    it('does not create a self-accepting boundary for mixed non-component exports', () => {
      const path = getProgramPath(`
        export const LABEL = 'visible';

        export function Sentinel() {
          return <span>{LABEL}</span>;
        }
      `);
      const ctx = createContext(path, 'Sentinel.tsx', {
        mode: 'client',
        hmr: true,
        bundler: 'vite',
      } as any);

      collectTopLevelHmrComponents(path, ctx);
      applyHmr(path, ctx);

      const code = generate(path.node).code;
      expect(code).not.toContain('__signature');
      expect(code).not.toContain('__hmrId');
      expect(code).not.toContain('__$registry$__');
    });

    it('keeps HMR enabled for type-only exports', () => {
      const path = getProgramPath(`
        export type WidgetProps = {
          label: string;
        };

        export function Widget(props: WidgetProps) {
          return <span>{props.label}</span>;
        }
      `);
      const ctx = createContext(path, 'Widget.tsx', {
        mode: 'client',
        hmr: true,
        bundler: 'vite',
      } as any);

      collectTopLevelHmrComponents(path, ctx);
      applyHmr(path, ctx);

      const code = generate(path.node).code;
      expect(code).toContain('Widget.__signature');
      expect(code).toContain('Widget.__hmrId');
      expect(code).toContain('const __$registry$__ = [Widget];');
    });

    it('keeps HMR enabled for component-only export specifiers', () => {
      const path = getProgramPath(`
        function Widget() {
          return <span />;
        }

        const Panel = () => <section />;

        export { Widget, Panel as RootPanel };
      `);
      const ctx = createContext(path, 'Widget.tsx', {
        mode: 'client',
        hmr: true,
        bundler: 'vite',
      } as any);

      collectTopLevelHmrComponents(path, ctx);
      applyHmr(path, ctx);

      const code = generate(path.node).code;
      expect(code).toContain('Widget.__hmrId');
      expect(code).toContain('Panel.__hmrId');
      expect(code).toContain('const __$registry$__ = [Widget, Panel];');
    });

    it('does not treat local createApp functions as Essor mount calls', () => {
      const path = getProgramPath(`
        function createApp(component: unknown) {
          return component;
        }

        function App() {
          return <main />;
        }

        createApp(App);
      `);
      const ctx = createContext(path, 'LocalCreateApp.tsx', {
        mode: 'client',
        hmr: true,
        bundler: 'vite',
      } as any);

      collectTopLevelHmrComponents(path, ctx);
      applyHmr(path, ctx);

      const code = generate(path.node).code;
      expect(code).toContain('createApp(App);');
      expect(code).not.toContain('createApp(__$createHMRComponent$__(App))');
      expect(code).not.toContain('import.meta.hot?.dispose');
    });

    it('recognizes aliased Essor mount imports', () => {
      const path = getProgramPath(`
        import { createApp as mount } from 'essor';

        function App() {
          return <main />;
        }

        mount(App, '#root');
      `);
      const ctx = createContext(path, 'AliasedMount.tsx', {
        mode: 'client',
        hmr: true,
        bundler: 'vite',
      } as any);

      collectTopLevelHmrComponents(path, ctx);
      applyHmr(path, ctx);

      const code = generate(path.node).code;
      expect(code).toContain("const _app = mount(__$createHMRComponent$__(App), '#root');");
      expect(code).toContain('import.meta.hot?.dispose(() => _app?.unmount?.());');
    });

    it('does not wrap Essor helpers shadowed by local bindings', () => {
      const path = getProgramPath(`
        import { createApp, createComponent } from 'essor';

        function App() {
          return <main />;
        }

        function render(createApp: (value: unknown) => unknown) {
          const createComponent = (value: unknown) => value;
          createApp(App);
          createComponent(App);
        }
      `);
      const ctx = createContext(path, 'ShadowedHelpers.tsx', {
        mode: 'client',
        hmr: true,
        bundler: 'vite',
      } as any);

      collectTopLevelHmrComponents(path, ctx);
      applyHmr(path, ctx);

      const code = generate(path.node).code;
      expect(code).toContain('createApp(App);');
      expect(code).toContain('createComponent(App);');
      expect(code).not.toContain('createApp(__$createHMRComponent$__(App))');
      expect(code).not.toContain('__$createHMRComponent$__(App);');
    });
  });
});
