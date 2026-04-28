import { describe, expect, it } from 'vitest';
import { type InjectionKey, inject, provide } from '@estjs/template';
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

  it('returns empty string and logs error if component is not a function', async () => {
    // @ts-expect-error
    await expect(renderToStringAsync(null)).resolves.toBe('');
  });
});
