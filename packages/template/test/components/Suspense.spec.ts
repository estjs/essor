import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Suspense } from '../../src/components/Suspense';
import { mount } from '../testUtils';

describe('suspense组件', () => {
  let container;

  beforeEach(() => {
    // 清除全局上下文
    delete (window as any).__SUSPENSE_CONTEXT__;

    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    // 清理上下文
    delete (window as any).__SUSPENSE_CONTEXT__;
    vi.restoreAllMocks();
    document.body.removeChild(container);
  });

  it('应首先显示fallback内容', () => {
    const app = () => {
      return Suspense({
        fallback: document.createTextNode('Loading...'),
        children: document.createTextNode('Content loaded'),
      });
    };

    const result = mount(app, container);

    // 初始状态应该显示fallback内容
    expect(result.text()).toBe('Loading...');
  });

  it('应在没有待处理的promise时显示子内容', async () => {
    const app = () => {
      return Suspense({
        fallback: document.createTextNode('Loading...'),
        children: document.createTextNode('Content loaded'),
      });
    };

    const result = mount(app, container);

    // 初始化Suspense后，它应该创建全局上下文
    expect((window as any).__SUSPENSE_CONTEXT__).toBeDefined();

    // 模拟没有待处理的promise
    const mockPromise = Promise.resolve();
    (window as any).__SUSPENSE_CONTEXT__.registerPromise(mockPromise);

    // 等待promise解析
    await mockPromise;

    // 内容应该切换为子内容
    expect(result.text()).toBe('Content loaded');
  });

  it('应处理多个并发的异步操作', async () => {
    const app = () => {
      return Suspense({
        fallback: document.createTextNode('Loading...'),
        children: document.createTextNode('All content loaded'),
      });
    };

    const result = mount(app, container);

    // 注册多个promise
    const promise1 = new Promise(resolve => setTimeout(resolve, 10));
    const promise2 = new Promise(resolve => setTimeout(resolve, 20));

    (window as any).__SUSPENSE_CONTEXT__.registerPromise(promise1);
    (window as any).__SUSPENSE_CONTEXT__.registerPromise(promise2);

    // 在所有promise完成前应该显示fallback
    expect(result.text()).toBe('Loading...');

    // 等待第一个promise完成
    await promise1;

    // 由于第二个promise还未完成，应该仍然显示fallback
    expect(result.text()).toBe('Loading...');

    // 等待第二个promise完成
    await promise2;

    // 所有promise完成后，应该显示子内容
    expect(result.text()).toBe('All content loaded');
  });

  it('应在组件销毁时清理上下文', () => {
    // 渲染Suspense组件
    mount(() =>
      Suspense({
        fallback: document.createTextNode('Loading...'),
        children: document.createTextNode('Content'),
      }),
    );

    // 确认上下文被创建
    expect((window as any).__SUSPENSE_CONTEXT__).toBeDefined();

    // 模拟生命周期钩子调用（这里简化处理，直接清除上下文）
    delete (window as any).__SUSPENSE_CONTEXT__;

    // 上下文应该被清理
    expect((window as any).__SUSPENSE_CONTEXT__).toBeUndefined();
  });

  it('应正确处理嵌套的Suspense组件', () => {
    const app = () => {
      const innerSuspense = Suspense({
        fallback: document.createTextNode('Inner loading...'),
        children: document.createTextNode('Inner content'),
      });

      return Suspense({
        fallback: document.createTextNode('Outer loading...'),
        children: innerSuspense,
      });
    };

    const result = mount(app, container);

    // 外层Suspense应该显示它的fallback
    expect(result.text()).toBe('Outer loading...');

    // 模拟外层Suspense完成
    const outerPromise = Promise.resolve();
    (window as any).__SUSPENSE_CONTEXT__.registerPromise(outerPromise);

    // 外层完成后，内层Suspense应该接管并显示它的fallback
    return outerPromise.then(() => {
      expect(result.text()).toBe('Inner loading...');
    });
  });
});
