import { effect, signal } from '@estjs/signals';
import { insert } from '../binding';
import { onDestroyed, onMounted } from '../lifecycle';
import type { ComponentProps } from '../component';

export interface SuspenseProps extends ComponentProps {
  fallback: any;
}

/**
 * Suspense component - handles async component loading, displays fallback content
 * @param {SuspenseProps} props - Component props containing fallback and children
 * @returns {Node} A container node
 */
export function Suspense(props: SuspenseProps): Node {
  // Create a container node
  const container = document.createElement('div');
  container.style.display = 'contents'; // Doesn't affect DOM structure

  // Create loading state signal
  const isLoading = signal(true);
  // Create Promise collector
  const pendingPromises: Set<Promise<any>> = new Set();

  // Set global context to allow descendant components to register promises
  const suspenseContext = {
    registerPromise: (promise: Promise<any>) => {
      // Register promise
      pendingPromises.add(promise);
      isLoading.value = true;

      // Handle promise completion
      promise.finally(() => {
        pendingPromises.delete(promise);
        // If no pending promises, display content
        if (pendingPromises.size === 0) {
          isLoading.value = false;
        }
      });
    },
  };

  (window as any).__SUSPENSE_CONTEXT__ = suspenseContext;

  // Listen to loading state, switch display content
  onMounted(() => {
    const renderContent = () => {
      // Clear container
      container.innerHTML = '';

      if (isLoading.value && props.fallback) {
        // Display loading state
        insert(container, () => props.fallback);
      } else if (props.children) {
        // Display child content
        insert(container, () => props.children);
      }
    };

    // Create effect to listen to isLoading signal
    effect(() => {
      isLoading.value; // Subscribe to signal changes
      renderContent();
    });

    // If no promises registered, display content immediately
    if (pendingPromises.size === 0) {
      isLoading.value = false;
    }
  });

  // Clean up when component is destroyed
  onDestroyed(() => {
    delete (window as any).__SUSPENSE_CONTEXT__;
  });

  return container;
}
