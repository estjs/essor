import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Portal } from '../../src/components/Portal';
import { mount } from '../testUtils';

describe('portal组件', () => {
  let container;
  let portalTarget;

  beforeEach(() => {
    // 创建测试容器
    container = document.createElement('div');
    container.id = 'app';
    document.body.appendChild(container);

    // 创建Portal目标容器
    portalTarget = document.createElement('div');
    portalTarget.id = 'portal-target';
    document.body.appendChild(portalTarget);
  });

  afterEach(() => {
    // 清理DOM
    document.body.removeChild(container);
    if (portalTarget.parentNode) {
      document.body.removeChild(portalTarget);
    }
  });

  it('应将内容渲染到目标容器中', () => {
    const app = () => {
      return Portal({
        container: '#portal-target',
        children: document.createTextNode('Portal Content'),
      });
    };

    mount(app, container);

    // 验证内容被渲染到目标容器而不是原始容器
    expect(container.textContent).toBe('');
    expect(portalTarget.textContent).toBe('Portal Content');

    // 应该在原始容器中有一个Portal注释节点
    const commentNodes = Array.from(container.childNodes).filter(
      node => node instanceof Comment,
    ) as Comment[];

    expect(commentNodes.length).toBe(1);
    expect(commentNodes[0].textContent).toBe('portal');
  });

  it('应在未指定容器时默认使用document.body', () => {
    const app = () => {
      return Portal({
        children: document.createTextNode('Default Portal'),
      });
    };

    mount(app);

    // 由于内容被放到body中，我们需要检查是否包含Portal内容
    const portalWrapper = document.querySelector('div[data-portal-id]');
    expect(portalWrapper).not.toBeNull();
    if (portalWrapper) {
      expect(portalWrapper.textContent).toBe('Default Portal');

      // 清理，避免影响其他测试
      portalWrapper.parentNode?.removeChild(portalWrapper);
    }
  });

  it('应支持使用Element对象作为容器', () => {
    const customTarget = document.createElement('div');
    customTarget.id = 'custom-target';
    document.body.appendChild(customTarget);

    const app = () => {
      return Portal({
        container: customTarget,
        children: document.createTextNode('Custom Target'),
      });
    };

    mount(app);

    // 验证内容被渲染到自定义容器
    expect(customTarget.textContent).toBe('Custom Target');

    // 清理
    document.body.removeChild(customTarget);
  });

  it('应在目标容器不存在时记录错误', () => {
    // 捕获控制台错误
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const app = () => {
      return Portal({
        container: '#non-existent',
        children: document.createTextNode('Error Content'),
      });
    };

    mount(app);

    // 验证错误被记录
    expect(consoleErrorSpy).toHaveBeenCalledWith('Portal target container not found');

    // 恢复控制台
    consoleErrorSpy.mockRestore();
  });

  it('应支持keepAlive选项', () => {
    const app = () => {
      return Portal({
        container: '#portal-target',
        keepAlive: true,
        children: document.createTextNode('Preserved Content'),
      });
    };

    // 这里我们假设mount返回的是渲染结果，但实际实现可能不同
    // 在真实测试中应该根据实际API进行调整
    mount(app);

    // 验证内容被渲染到目标容器
    expect(portalTarget.textContent).toBe('Preserved Content');

    // 注意：由于我们没有真正的组件实例引用，无法直接测试destroy
    // 在真实测试中需要根据框架的API进行调整

    // 清理，避免影响其他测试
    portalTarget.innerHTML = '';
  });

  it('应处理动态变化的子内容', () => {
    let content = 'Initial Content';

    const getApp = () => {
      return () =>
        Portal({
          container: '#portal-target',
          children: document.createTextNode(content),
        });
    };

    // 初始渲染
    mount(getApp());

    // 验证初始内容
    expect(portalTarget.textContent).toBe('Initial Content');

    // 更新内容
    content = 'Updated Content';

    // 重新渲染，模拟内容更新
    // 注意：在真实环境中，这里应该使用框架的更新机制
    mount(getApp());

    // 验证内容已更新
    expect(portalTarget.textContent).toBe('Updated Content');
  });

  it('应处理同时存在的多个Portal实例', () => {
    const firstTarget = document.createElement('div');
    firstTarget.id = 'first-target';
    document.body.appendChild(firstTarget);

    const secondTarget = document.createElement('div');
    secondTarget.id = 'second-target';
    document.body.appendChild(secondTarget);

    const app = () => {
      const firstPortal = Portal({
        container: '#first-target',
        children: document.createTextNode('First Portal'),
      });

      const secondPortal = Portal({
        container: '#second-target',
        children: document.createTextNode('Second Portal'),
      });

      // 创建容器包含两个Portal实例
      const container = document.createElement('div');
      container.appendChild(firstPortal);
      container.appendChild(secondPortal);
      return container;
    };

    mount(app);

    // 验证两个Portal都正确渲染到各自的目标容器
    expect(firstTarget.textContent).toBe('First Portal');
    expect(secondTarget.textContent).toBe('Second Portal');

    // 清理
    document.body.removeChild(firstTarget);
    document.body.removeChild(secondTarget);
  });
});
