import { effect, signal } from '@estjs/signal';
import { insert } from '../binding';
import { onDestroyed, onMounted } from '../lifecycle';
import type { ComponentProps } from '../component';

export interface PortalProps extends ComponentProps {
  container?: Element | string;
  // Whether to keep content when Portal component unmounts
  keepAlive?: boolean;
}

/**
 * Portal component - Renders content to other locations in the DOM tree
 * @param {PortalProps} props - Component props containing container and children
 * @returns {Node} A comment node as placeholder
 */
export function Portal(props: PortalProps): Node {
  // Create a comment node as placeholder
  const portalNode = document.createComment('portal');

  // Container signal, allows dynamic changes
  const containerSignal = signal<Element | null>(null);

  // Create DOM container to wrap child elements for easier tracking and cleanup
  const wrapper = document.createElement('div');
  wrapper.style.display = 'contents'; // Doesn't affect DOM layout
  wrapper.dataset.portalId = `portal-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  // Get target container
  const getContainer = (): Element | null => {
    if (!props.container) {
      // Default to document.body
      return document.body;
    }

    if (typeof props.container === 'string') {
      // If string, treat as selector
      return document.querySelector(props.container);
    }

    // Return Element object directly
    return props.container;
  };

  // Cleanup function
  const cleanup = () => {
    // If keepAlive is set, don't clean up nodes
    if (props.keepAlive) return;

    const container = containerSignal.value;
    if (container && wrapper.parentNode === container) {
      container.removeChild(wrapper);
    }
  };

  // Update target container and content
  const updatePortal = () => {
    cleanup(); // Clean up old first to avoid multiple additions

    const container = getContainer();
    if (!container) {
      console.error('Portal target container not found');
      return;
    }

    containerSignal.value = container;

    // Add wrapper to target container
    container.appendChild(wrapper);

    // Render content in wrapper
    if (props.children) {
      // Render child content
      wrapper.innerHTML = ''; // Clear old content
      insert(wrapper, () => props.children);
    }
  };

  // When component mounts, render child nodes to target container
  onMounted(() => {
    updatePortal();

    // Dynamically listen to child content and container changes
    effect(() => {
      // Trigger dependency collection, update when props.children or props.container changes
      props.children;
      props.container;
      updatePortal();
    });
  });

  // Clean up when component is destroyed
  onDestroyed(() => {
    cleanup();
  });

  // Return placeholder
  return portalNode;
}
