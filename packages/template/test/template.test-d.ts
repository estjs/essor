import { describe, expectTypeOf, it } from 'vitest';
import {
  type AnyNode,
  type AppInstance,
  type Component,
  type ComponentFn,
  For,
  Fragment,
  type InjectionKey,
  Portal,
  type Resource,
  type ResourceActions,
  Suspense,
  Transition,
  TransitionGroup,
  createApp,
  createComponent,
  createResource,
  createSSRApp,
  hydrate,
  inject,
  isComponent,
  onDestroy,
  onMount,
  onUpdate,
  provide,
} from '../src';

describe('template typecheck', () => {
  it('types createApp and lifecycle helpers', () => {
    const MyComp: ComponentFn = () => document.createElement('div');

    const app = createApp(MyComp, '#app');
    expectTypeOf(app).toEqualTypeOf<AppInstance | undefined>();

    const ssrApp = createSSRApp(MyComp, '#app');
    expectTypeOf(ssrApp).toEqualTypeOf<AppInstance | undefined>();

    const hydrated = hydrate(MyComp, '#app');
    expectTypeOf(hydrated).toEqualTypeOf<AppInstance | undefined>();
  });

  it('types lifecycle hooks with optional cleanup return', () => {
    onMount(() => {
      // cleanup callback can be returned
      return () => {};
    });

    onMount(async () => {});
    onUpdate(() => {});
    onDestroy(() => {});
  });

  it('types provide and inject with InjectionKey and strings', () => {
    const KEY: InjectionKey<{ theme: string }> = Symbol('theme');

    provide(KEY, { theme: 'dark' });
    const injected = inject(KEY);
    expectTypeOf(injected).toEqualTypeOf<{ theme: string } | undefined>();

    const fallback = inject(KEY, { theme: 'light' });
    expectTypeOf(fallback).toEqualTypeOf<{ theme: string }>();

    provide('strKey', 123);
    const num = inject<number>('strKey');
    expectTypeOf(num).toEqualTypeOf<number | undefined>();
  });

  it('types createComponent and isComponent', () => {
    const Dummy: ComponentFn = () => document.createElement('span');
    const comp = createComponent(Dummy);
    expectTypeOf(comp).toEqualTypeOf<Component<Record<string, unknown>>>();
    expectTypeOf(isComponent(comp)).toEqualTypeOf<boolean>();
  });

  it('types built-in components', () => {
    // For
    const forNode = For({
      each: [1, 2, 3],
      fallback: () => document.createElement('p'),
      children: (item, index) => {
        expectTypeOf(item).toEqualTypeOf<number>();
        expectTypeOf(index).toEqualTypeOf<number>();
        return document.createElement('div');
      },
    });
    expectTypeOf(forNode).toMatchTypeOf<AnyNode>();

    // Fragment
    const fragNode = Fragment({
      children: [document.createElement('div')],
    });
    expectTypeOf(fragNode).toMatchTypeOf<AnyNode>();

    // Portal
    const portalNode = Portal({
      target: '#portal-root',
      children: document.createElement('div'),
    });
    expectTypeOf(portalNode).toMatchTypeOf<AnyNode>();

    // Suspense
    const suspenseNode = Suspense({
      fallback: document.createElement('div'),
      children: document.createElement('span'),
    });
    expectTypeOf(suspenseNode).toMatchTypeOf<AnyNode>();

    // Transition
    const transitionNode = Transition({
      name: 'fade',
      appear: true,
      children: document.createElement('div'),
    });
    expectTypeOf(transitionNode).toMatchTypeOf<AnyNode>();

    // TransitionGroup
    const groupNode = TransitionGroup({
      tag: 'ul',
      each: [{ id: 1, text: 'a' }],
      key: (item) => item.id,
      children: (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    });
    expectTypeOf(groupNode).toMatchTypeOf<AnyNode>();
  });

  it('types createResource', () => {
    const [data, actions] = createResource(
      async (abortSignal) => {
        expectTypeOf(abortSignal).toEqualTypeOf<AbortSignal>();
        return 'result';
      },
      { initialValue: 'init' },
    );

    expectTypeOf(data).toEqualTypeOf<Resource<string>>();
    expectTypeOf(data()).toEqualTypeOf<string | undefined>();
    expectTypeOf(data.loading.value).toEqualTypeOf<boolean>();
    expectTypeOf(data.error.value).toEqualTypeOf<Error | null>();
    expectTypeOf(actions).toEqualTypeOf<ResourceActions<string>>();
    expectTypeOf(actions.mutate).toEqualTypeOf<(value: string) => void>();
    expectTypeOf(actions.refetch).toEqualTypeOf<() => Promise<void>>();
  });
});
