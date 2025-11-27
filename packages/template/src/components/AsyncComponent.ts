import { effect, signal } from '@estjs/signals';
import { onMounted } from '../lifecycle';
import type { ComponentProps } from '../component';

export interface AsyncComponentOptions {
  loader: () => Promise<any>;
  errorComponent?: (error: Error) => any;
}

/**
 * AsyncComponent - Lazy loading component
 * @param {AsyncComponentOptions} options - Component configuration containing loader and errorComponent
 * @returns {Function} Returns a component function
 */
export function AsyncComponent(options: AsyncComponentOptions) {
  // Return a functional component
  return function (props: ComponentProps): Node {
    // Create placeholder node
    const placeholder = document.createComment('async-component');

    // Component state
    const loadedComponent = signal<any>(null);
    const isLoading = signal(true);
    const error = signal<Error | null>(null);

    // Load component
    const loadComponent = async () => {
      try {
        isLoading.value = true;

        // Get Suspense context and register async loading
        const suspenseContext = (window as any).__SUSPENSE_CONTEXT__;
        const loadPromise = options.loader();

        if (suspenseContext) {
          suspenseContext.registerPromise(loadPromise);
        }

        // Wait for component to load
        const component = await loadPromise;
        loadedComponent.value = component?.default || component;
      } catch (error_) {
        error.value = error_ as Error;
        console.error('Failed to load component:', error_);
      } finally {
        isLoading.value = false;
      }
    };

    // Load component when mounted
    onMounted(() => {
      loadComponent();

      // Listen to component loading state and render component
      effect(() => {
        if (!placeholder.parentNode) return;

        if (error.value && options.errorComponent) {
          // Render error component
          const errorNode = options.errorComponent(error.value);

          if (errorNode && placeholder.parentNode) {
            // Replace placeholder
            placeholder.parentNode.replaceChild(errorNode, placeholder);
          }
        } else if (loadedComponent.value) {
          // Render loaded component
          try {
            const loadedNode = loadedComponent.value(props);

            if (loadedNode && placeholder.parentNode) {
              // Replace placeholder
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
