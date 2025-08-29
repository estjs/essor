import { effect, signal } from '@estjs/signal';
import { onMounted } from '../lifecycle';
import type { ComponentProps } from '../component';

export interface AsyncComponentOptions {
  loader: () => Promise<any>;
  errorComponent?: (error: Error) => any;
}

/**
 * AsyncComponent - 懒加载组件
 * @param {AsyncComponentOptions} options - 组件配置，包含loader和errorComponent
 * @returns {Function} 返回一个组件函数
 */
export function AsyncComponent(options: AsyncComponentOptions) {
  // 返回一个函数组件
  return function (props: ComponentProps): Node {
    // 创建占位节点
    const placeholder = document.createComment('async-component');

    // 组件状态
    const loadedComponent = signal<any>(null);
    const isLoading = signal(true);
    const error = signal<Error | null>(null);

    // 加载组件
    const loadComponent = async () => {
      try {
        isLoading.value = true;

        // 获取Suspense上下文，注册异步加载
        const suspenseContext = (window as any).__SUSPENSE_CONTEXT__;
        const loadPromise = options.loader();

        if (suspenseContext) {
          suspenseContext.registerPromise(loadPromise);
        }

        // 等待组件加载完成
        const component = await loadPromise;
        loadedComponent.value = component?.default || component;
      } catch (error_) {
        error.value = error_ as Error;
        console.error('Failed to load component:', error_);
      } finally {
        isLoading.value = false;
      }
    };

    // 组件挂载时加载
    onMounted(() => {
      loadComponent();

      // 监听组件加载状态，渲染组件
      effect(() => {
        if (!placeholder.parentNode) return;

        if (error.value && options.errorComponent) {
          // 渲染错误组件
          const errorNode = options.errorComponent(error.value);

          if (errorNode && placeholder.parentNode) {
            // 替换占位符
            placeholder.parentNode.replaceChild(errorNode, placeholder);
          }
        } else if (loadedComponent.value) {
          // 渲染加载的组件
          try {
            const loadedNode = loadedComponent.value(props);

            if (loadedNode && placeholder.parentNode) {
              // 替换占位符
              placeholder.parentNode.replaceChild(loadedNode, placeholder);
            }
          } catch (error_) {
            console.error('Failed to render async component:', error_);
          }
        }
      });
    });

    return placeholder;
  };
}
