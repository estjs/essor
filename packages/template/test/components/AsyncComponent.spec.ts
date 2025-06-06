import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AsyncComponent } from '../../src/components/AsyncComponent';
import { mount } from '../testUtils';

describe('asyncComponent组件', () => {
  let container;

  beforeEach(() => {
    // 创建测试容器
    // 清除全局上下文
    delete (window as any).__SUSPENSE_CONTEXT__;
    // 模拟定时器
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    // 清理上下文
    delete (window as any).__SUSPENSE_CONTEXT__;
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.removeChild(container);

  });



  it('应正确处理组件加载状态', async () => {
    // 模拟一个异步组件加载器
    const mockLoader = vi.fn().mockImplementation(() => {
      return new Promise(resolve => {
        setTimeout(() => {
          resolve(() => {
            const element = document.createElement('div');
            element.textContent = 'Async Component Loaded';
            return element;
          });
        }, 50);
      });
    });

    // 创建一个异步组件
    const MyAsyncComponent = AsyncComponent({
      loader: mockLoader,
    });

    // 渲染异步组件
    const result = mount(() => MyAsyncComponent({}), container);

    // 确保加载器被调用
    expect(mockLoader).toHaveBeenCalled();

    // 等待异步组件加载完成
    await vi.advanceTimersByTimeAsync(100);

    // 组件应该被渲染
    expect(result.text()).toBe('Async Component Loaded');
  });

  it('应使用Suspense上下文注册异步加载', async () => {
    // 模拟Suspense上下文
    const registerPromise = vi.fn();
    (window as any).__SUSPENSE_CONTEXT__ = { registerPromise };

    // 模拟异步加载器
    const mockPromise = Promise.resolve(() => {
      const element = document.createElement('div');
      element.textContent = 'Loaded';
      return element;
    });

    const mockLoader = vi.fn().mockReturnValue(mockPromise);

    // 创建异步组件
    const MyAsyncComponent = AsyncComponent({
      loader: mockLoader,
    });

    // 渲染组件
    const result = mount(() => MyAsyncComponent({}), container);

    // 验证异步加载被注册到Suspense上下文
    expect(registerPromise).toHaveBeenCalledWith(mockPromise);

    // 等待组件加载完成
    await mockPromise;
    await Promise.resolve();

    // 组件应该被渲染
    expect(result.text()).toBe('Loaded');
  });

  it('应处理加载错误并显示错误组件', async () => {
    // 模拟加载错误
    const mockError = new Error('Failed to load component');
    const mockLoader = vi.fn().mockImplementation(() => {
      return Promise.reject(mockError);
    });

    // 创建错误处理组件
    const errorHandler = vi.fn().mockImplementation(error => {
      const element = document.createElement('div');
      element.textContent = `Error: ${error.message}`;
      return element;
    });

    // 创建异步组件
    const MyAsyncComponent = AsyncComponent({
      loader: mockLoader,
      errorComponent: errorHandler,
    });

    // 渲染组件
    const result = mount(() => MyAsyncComponent({}), container);

    // 等待错误处理
    await vi.runAllTimersAsync();
    await Promise.resolve();

    // 验证错误处理器被调用
    expect(errorHandler).toHaveBeenCalled();

    // 错误信息应该被渲染
    expect(result.text()).toBe('Error: Failed to load component');
  });

  it('应传递props给加载的组件', async () => {
    // 模拟接收props的组件
    const mockComponent = vi.fn().mockImplementation(props => {
      const element = document.createElement('div');
      element.textContent = `Name: ${props.name}, Age: ${props.age}`;
      return element;
    });

    // 模拟加载器返回组件
    const mockLoader = vi.fn().mockImplementation(() => {
      return Promise.resolve(mockComponent);
    });

    // 创建异步组件
    const MyAsyncComponent = AsyncComponent({
      loader: mockLoader,
    });

    // 渲染组件并传递props
    const props = { name: 'Test User', age: 25 };
    const result = mount(() => MyAsyncComponent(props), container);

    // 等待组件加载完成
    await vi.runAllTimersAsync();
    await Promise.resolve();

    // 验证props被正确传递
    expect(mockComponent).toHaveBeenCalledWith(props);
    expect(result.text()).toBe('Name: Test User, Age: 25');
  });

  it('应处理ES模块导出的组件', async () => {
    // 模拟ES模块导出的组件
    const mockComponentFn = _props => {
      const element = document.createElement('div');
      element.textContent = 'ES Module Component';
      return element;
    };

    // 模拟ES模块格式的导出
    const mockModule = {
      default: mockComponentFn,
    };

    // 模拟加载器返回ES模块
    const mockLoader = vi.fn().mockImplementation(() => {
      return Promise.resolve(mockModule);
    });

    // 创建异步组件
    const MyAsyncComponent = AsyncComponent({
      loader: mockLoader,
    });

    // 渲染组件
    const result = mount(() => MyAsyncComponent({}), container);

    // 等待组件加载完成
    await vi.runAllTimersAsync();
    await Promise.resolve();

    // 验证组件被正确渲染
    expect(result.text()).toBe('ES Module Component');
  });
});
