import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Fragment } from '../../src/components/Fragment';
import { mount } from '../testUtils';

describe('fragment组件', () => {
  let container;

  beforeEach(() => {
    // 创建测试容器
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    // 清理DOM
    document.body.removeChild(container);
  });

  it('应正确渲染子元素而不引入额外的DOM节点', () => {
    // 使用Fragment渲染多个子元素
    const app = () => {
      return Fragment({
        children: [document.createElement('div'), document.createElement('span')],
      });
    };

    // 验证DOM中应该有2个子元素，一个div和一个span
    mount(app, container);
    expect(container.children.length).toBe(2);
    expect(container.querySelector('div')).not.toBeNull();
    expect(container.querySelector('span')).not.toBeNull();
  });

  it('应处理空子元素的情况', () => {
    const app = () => {
      return Fragment({ children: null });
    };

    mount(app, container);

    expect(container.children.length).toBe(0);
  });

  it('应处理子元素动态变化的情况', async () => {
    let showContent = false;

    const getApp = () => {
      const children = showContent
        ? [document.createElement('div'), document.createElement('p')]
        : null;

      return Fragment({ children });
    };

    // 初始渲染
    mount(() => getApp(), container);

    // 初始状态：无子元素
    expect(container.children.length).toBe(0);

    // 修改状态，显示子元素
    showContent = true;

    // 重新渲染
    mount(() => getApp(), container);

    // 等待DOM更新
    await Promise.resolve();

    // 验证子元素已经渲染
    expect(container.children.length).toBe(2);
    expect(container.querySelector('div')).not.toBeNull();
    expect(container.querySelector('p')).not.toBeNull();
  });

  it('应处理嵌套Fragment的情况', () => {
    const app = () => {
      const innerFragment = Fragment({
        children: document.createElement('button'),
      });

      return Fragment({
        children: [document.createElement('h1'), innerFragment],
      });
    };

    mount(app, container);

    // 验证嵌套内容都被正确渲染
    expect(container.querySelector('h1')).not.toBeNull();
    expect(container.querySelector('button')).not.toBeNull();
  });

  it('应与文本节点配合使用', () => {
    const app = () => {
      return Fragment({
        children: [
          document.createTextNode('Hello'),
          document.createElement('span'),
          document.createTextNode('World'),
        ],
      });
    };

    mount(app, container);

    // 检查文本内容
    expect(container.textContent).toBe('HelloWorld');
    expect(container.querySelector('span')).not.toBeNull();
  });
});
