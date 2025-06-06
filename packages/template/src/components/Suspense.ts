import { effect, signal } from '@estjs/signal';
import { type ComponentProps } from '../component';
import { insert } from '../binding';
import { onDestroyed, onMounted } from '../lifecycle';

export interface SuspenseProps extends ComponentProps {
  fallback: any;
}

/**
 * Suspense组件 - 处理异步组件加载，显示fallback内容
 * @param {SuspenseProps} props - 组件属性，包含fallback和children
 * @returns {Node} 一个容器节点
 */
export function Suspense(props: SuspenseProps): Node {
  // 创建一个容器节点
  const container = document.createElement('div');
  container.style.display = 'contents'; // 不影响DOM结构

  // 创建加载状态信号
  const isLoading = signal(true);
  // 创建Promise收集器
  const pendingPromises: Set<Promise<any>> = new Set();

  // 设置全局上下文，让后代组件可以注册promise
  const suspenseContext = {
    registerPromise: (promise: Promise<any>) => {
      // 注册promise
      pendingPromises.add(promise);
      isLoading.value = true;

      // 处理promise完成
      promise.finally(() => {
        pendingPromises.delete(promise);
        // 如果没有待处理的promise，显示内容
        if (pendingPromises.size === 0) {
          isLoading.value = false;
        }
      });
    },
  };

  (window as any).__SUSPENSE_CONTEXT__ = suspenseContext;

  // 监听加载状态，切换显示内容
  onMounted(() => {
    const renderContent = () => {
      // 清空容器
      container.innerHTML = '';

      if (isLoading.value && props.fallback) {
        // 显示加载中状态
        insert(container, () => props.fallback);
      } else if (props.children) {
        // 显示子内容
        insert(container, () => props.children);
      }
    };

    // 创建效果监听isLoading信号
    effect(() => {
      isLoading.value; // 订阅信号变化
      renderContent();
    });

    // 如果没有注册promise，立即显示内容
    if (pendingPromises.size === 0) {
      isLoading.value = false;
    }
  });

  // 组件销毁时清理
  onDestroyed(() => {
    delete (window as any).__SUSPENSE_CONTEXT__;
  });

  return container;
}
