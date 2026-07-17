import { expectTypeOf, it } from 'vitest';
import {
  For,
  Fragment,
  Portal,
  type SSRNode,
  Suspense,
  createSSRComponent,
  escape,
  render,
  renderToString,
  renderToStringAsync,
  ssr,
  ssrComponent,
  unsafeHTML,
} from '../src/index';

// eslint-disable-next-line vitest/expect-expect -- expectTypeOf is a compile-time assertion.
it('exposes honest public and compiler-facing SSR return types', () => {
  expectTypeOf(render(['<div />'], '')).toEqualTypeOf<string>();
  expectTypeOf(renderToString(() => 'text')).toEqualTypeOf<string>();
  expectTypeOf(renderToStringAsync(() => 'text')).toEqualTypeOf<Promise<string>>();
  expectTypeOf(escape('<text>')).toEqualTypeOf<string>();
  expectTypeOf(createSSRComponent(() => 'text')).toEqualTypeOf<string>();

  const node = unsafeHTML('<strong>trusted</strong>');
  expectTypeOf(ssr(['<div />'], '')).toEqualTypeOf<SSRNode>();
  expectTypeOf(ssrComponent(() => 'text')).toEqualTypeOf<SSRNode>();
  expectTypeOf(node).toEqualTypeOf<SSRNode>();
  expectTypeOf(Fragment({ children: node })).toEqualTypeOf<SSRNode>();
  expectTypeOf(Portal({ children: node, disabled: true })).toEqualTypeOf<SSRNode>();
  expectTypeOf(Suspense({ children: node })).toEqualTypeOf<SSRNode>();
  expectTypeOf(For({ each: [node], children: (item) => item })).toEqualTypeOf<SSRNode>();
});

// eslint-disable-next-line vitest/expect-expect -- expectTypeOf is a compile-time assertion.
it('accepts server components that return trusted SSR nodes', () => {
  const Component = (): SSRNode => ssr(['<em>trusted</em>'], '');

  expectTypeOf(renderToString(Component)).toEqualTypeOf<string>();
  expectTypeOf(createSSRComponent(Component)).toEqualTypeOf<string>();
  expectTypeOf(ssrComponent(Component)).toEqualTypeOf<SSRNode>();
});
