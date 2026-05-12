import { describe, expect, it } from 'vitest';
import { type InjectionKey, inject, provide } from '@estjs/template';
import { getActiveScope } from '@estjs/template/internal';
import { renderToStringAsync } from '../src/render';

describe('server/renderToStringAsync', () => {
  it('renders sync component', async () => {
    const Component = () => '<div>sync</div>';
    await expect(renderToStringAsync(Component)).resolves.toBe('<div>sync</div>');
  });

  it('renders async component', async () => {
    const AsyncComponent = async (props: { msg: string }) => {
      const value = await Promise.resolve(props.msg);
      return `<p>${value}</p>`;
    };
    await expect(renderToStringAsync(AsyncComponent as any, { msg: 'hi' })).resolves.toBe(
      '<p>hi</p>',
    );
  });

  it('awaits promises in array results', async () => {
    const Component = () => ['<a/>', Promise.resolve('<b/>'), ['<c/>', Promise.resolve('<d/>')]];
    await expect(renderToStringAsync(Component as any)).resolves.toBe('<a/><b/><c/><d/>');
  });

  it('preserves provide/inject across async boundary', async () => {
    const key: InjectionKey<string> = Symbol('async-ctx');
    const Child = () => {
      const v = inject(key, 'default');
      return `<x>${v}</x>`;
    };
    const Parent = () => {
      provide(key, 'provided');
      return Child();
    };
    await expect(renderToStringAsync(Parent)).resolves.toBe('<x>provided</x>');
  });

  it('keeps provide/inject available after an awaited parent render', async () => {
    const key: InjectionKey<string> = Symbol('awaited-ctx');
    const Child = () => {
      const value = inject(key, 'default');
      return `<x>${value}</x>`;
    };
    const Parent = async () => {
      provide(key, 'provided-after-await');
      await Promise.resolve();
      return Child();
    };

    await expect(renderToStringAsync(Parent)).resolves.toBe('<x>provided-after-await</x>');
  });

  it('disposes the async render scope after rejected components', async () => {
    const Component = async () => {
      expect(getActiveScope()).not.toBeNull();
      await Promise.resolve();
      throw new Error('boom');
    };

    await expect(renderToStringAsync(Component)).rejects.toThrow('boom');
    expect(getActiveScope()).toBeNull();
  });

  it('returns empty string and logs error if component is not a function', async () => {
    // @ts-expect-error
    await expect(renderToStringAsync(null)).resolves.toBe('');
  });
});
