import { effect, signal } from '@estjs/signal';
import { insert } from '../binding';
import { onDestroyed, onMounted } from '../lifecycle';
import type { ComponentProps } from '../component';

export interface PortalProps extends ComponentProps {
  container?: Element | string;
  // 是否在Portal组件卸载时保留内容
  keepAlive?: boolean;
}

/**
 * Portal组件 - 将内容渲染到DOM树的其他位置
 * @param {PortalProps} props - 组件属性，包含container和children
 * @returns {Node} 一个注释节点作为占位符
 */
export function Portal(props: PortalProps): Node {
  // 创建一个注释节点作为占位符
  const portalNode = document.createComment('portal');

  // 容器信号量，允许动态更改
  const containerSignal = signal<Element | null>(null);

  // 创建DOM容器来包装子元素，便于跟踪和清理
  const wrapper = document.createElement('div');
  wrapper.style.display = 'contents'; // 不影响DOM布局
  wrapper.dataset.portalId = `portal-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  // 获取目标容器
  const getContainer = (): Element | null => {
    if (!props.container) {
      // 默认使用document.body
      return document.body;
    }

    if (typeof props.container === 'string') {
      // 如果是字符串，视为选择器
      return document.querySelector(props.container);
    }

    // 直接返回Element对象
    return props.container;
  };

  // 清理函数
  const cleanup = () => {
    // 如果设置了keepAlive，则不清理节点
    if (props.keepAlive) return;

    const container = containerSignal.value;
    if (container && wrapper.parentNode === container) {
      container.removeChild(wrapper);
    }
  };

  // 更新目标容器和内容
  const updatePortal = () => {
    cleanup(); // 先清理旧的，避免多次添加

    const container = getContainer();
    if (!container) {
      console.error('Portal target container not found');
      return;
    }

    containerSignal.value = container;

    // 将包装器添加到目标容器
    container.appendChild(wrapper);

    // 在包装器中渲染内容
    if (props.children) {
      // 渲染子内容
      wrapper.innerHTML = ''; // 清空旧内容
      insert(wrapper, () => props.children);
    }
  };

  // 组件挂载时，将子节点渲染到目标容器
  onMounted(() => {
    updatePortal();

    // 动态监听子内容和容器变化
    effect(() => {
      // 触发依赖收集，当props.children或props.container改变时更新
      props.children;
      props.container;
      updatePortal();
    });
  });

  // 组件销毁时清理
  onDestroyed(() => {
    cleanup();
  });

  // 返回占位符
  return portalNode;
}
