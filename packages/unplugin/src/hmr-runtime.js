/**
 * Essor HMR Runtime - Signal-based Hot Module Replacement
 *
 * This runtime enables precise component-level HMR updates without full page reloads:
 *
 * 1. **Signal Wrapping**: Each component is wrapped in a reactive signal
 * 2. **Signature Tracking**: Components are tracked by code signatures (from babel plugin)
 * 3. **Precise Updates**: Only components with changed signatures are updated
 * 4. **Effect Subscription**: Component instances subscribe to signal changes via effects
 * 5. **Bundler Agnostic**: Works with Vite, Webpack, Rspack, and other bundlers
 */
import { createComponent, effect, signal } from 'essor';

// ============================================
// Component Registry
// ============================================

/**
 * Global component registry for HMR tracking
 *
 * Maps hmrId -> ComponentInfo where:
 * - hmrId: Unique identifier for component (fileHash:componentName)
 * - componentSignal: Reactive signal holding the current component function
 * - signature: Hash of component code (changes when code changes)
 * - instances: Set of active component instances
 * - cleanups: Map of cleanup functions for each instance's effect
 */
const componentRegistry = new Map();

/**
 * Create HMR-enabled component wrapper
 *
 * This function wraps a component to enable HMR:
 * 1. Creates or retrieves component registry entry
 * 2. Wraps component function to always read from latest signal value
 * 3. Sets up reactive effect to auto-update component when signal changes
 * 4. Returns regular component instance that auto-updates on HMR
 *
 * @param componentFn - Component function with __hmrId and __signature
 * @param props - Component props
 * @returns Component instance that responds to HMR updates
 */
export function createHMRComponent(componentFn, props) {
  const { __hmrId: hmrId, __signature: signature } = componentFn;

  if (!hmrId) {
    // If no hmrId, create normal component
    return createComponent(componentFn, props);
  }

  let info = componentRegistry.get(hmrId);

  if (!info) {
    // First registration: create signal wrapped component
    info = {
      componentSignal: signal(componentFn),
      signature,
      instances: new Set(), // Track all instances
      cleanups: new Map(), // Store cleanup for each instance
    };
    componentRegistry.set(hmrId, info);
  }

  // Attach _hmrInstances and _hmrInfo to component function
  // Component constructor will check this and auto-register
  if (!componentFn._hmrInstances) {
    componentFn._hmrInstances = info.instances;
    componentFn._hmrInfo = info;
  }

  // Create wrapper: read latest component from signal
  const wrappedFn = props => {
    const currentFn = info.componentSignal.value;
    return currentFn(props);
  };

  // Copy HMR properties to wrapper
  wrappedFn._hmrInstances = info.instances;
  wrappedFn._hmrInfo = info;
  wrappedFn.__hmrId = hmrId;
  wrappedFn.__signature = signature;
  Object.defineProperty(wrappedFn, 'name', {
    value: componentFn.name || 'HMRComponent',
    configurable: true,
  });

  // Create Component instance
  // Component class checks wrappedFn._hmrInstances and auto-registers
  const component = createComponent(wrappedFn, props);

  // Create effect for this Component instance
  // Auto call forceUpdate when signal changes
  let isFirstRun = true;
  const cleanup = effect(() => {
    // Read signal value to establish dependency
    // eslint-disable-next-line unused-imports/no-unused-vars
    const _ = info.componentSignal.value;

    // Skip first run
    if (isFirstRun) {
      isFirstRun = false;
      return;
    }

    // Update this specific instance when signal changes
    try {
      component.forceUpdate();
    } catch (error) {
      console.error(`[Essor HMR] Failed to update instance:`, error);
    }
  });

  // Store cleanup function
  info.cleanups.set(component, cleanup);

  return component;
}

// ============================================
// HMR Accept Handler
// ============================================

/**
 * Determine if a component needs to be updated
 *
 * A component should update if:
 * 1. Function instance changed (indicates module was re-executed)
 * 2. Signature changed (indicates component code was modified)
 *
 * @param oldInfo - Existing component registry info
 * @param newComponentFn - New component function from updated module
 * @param newSignature - New signature hash from updated module
 * @returns true if component should update
 */
function shouldUpdate(oldInfo, newComponentFn, newSignature) {
  if (!oldInfo) return true;

  // Check function instance (handles constant updates via module re-execution)
  const oldFn = oldInfo.componentSignal.value;
  if (oldFn !== newComponentFn) {
    return true;
  }

  // Check compile-time signature (handles component code changes)
  return oldInfo.signature !== newSignature;
}

/**
 * Check if a value is an HMR-enabled component
 *
 * @param value - Value to check
 * @returns true if value is a function with __hmrId property
 */
function isHMRComponent(value) {
  return value && typeof value === 'function' && value.__hmrId;
}

/**
 * Apply HMR updates to components
 *
 * Iterates through the new component registry and updates signals
 * for components whose signatures have changed. This triggers
 * reactive effects in component instances, causing them to re-render.
 *
 * @param registry - Array of components from updated module
 * @returns true if reload needed (errors occurred), false otherwise
 */
export function applyUpdate(registry) {
  if (!Array.isArray(registry) || registry.length === 0) {
    return false;
  }

  let needsReload = false;

  for (const entry of registry) {
    const { __hmrId: hmrId, __signature: signature } = entry;
    const id = hmrId;
    const info = componentRegistry.get(hmrId);

    if (!info) {
      // New component, skip (will be registered on first render)
      continue;
    }

    // Use shouldUpdate to determine if update is needed
    if (!shouldUpdate(info, entry, signature)) {
      continue;
    }

    // Component changed, apply update
    try {
      info.signature = signature;
      info.componentSignal.value = entry;
    } catch (error) {
      console.error(`[Essor HMR] Failed to update ${id}:`, error);
      needsReload = true;
    }
  }

  return needsReload;
}

/**
 * Setup HMR for Vite bundler
 *
 * Vite provides import.meta.hot.accept() callback that receives the new module
 */
function setupViteHMR(hot) {
  hot.accept(newModule => {
    if (!newModule) {
      hot.invalidate?.();
      return;
    }

    // Extract HMR components from new module
    const newRegistry = extractHMRComponents(newModule);
    if (newRegistry.length === 0) {
      return;
    }

    const needsReload = applyUpdate(newRegistry);
    if (needsReload) {
      hot.invalidate?.();
    }
  });
}

/**
 * Setup HMR for Webpack/Rspack bundlers
 *
 * Webpack-style HMR uses module.hot.accept() and hot.data for state persistence
 */
function setupWebpackHMR(hot, registry) {
  hot.accept?.();

  // Apply update if previous data exists
  if (hot.data?.__$registry$__) {
    const needsReload = applyUpdate(registry);
    if (needsReload && hot.invalidate) {
      hot.invalidate();
    }
  }

  // Save current registry for next update
  hot.dispose?.(data => {
    data.__$registry$__ = registry;
  });
}

/**
 * Setup HMR for other bundlers (fallback)
 *
 * Attempts to work with any bundler that provides a basic hot module API
 */
function setupStandardHMR(hot, registry) {
  // Try accept callback mode
  if (typeof hot.accept === 'function') {
    try {
      hot.accept(newModule => {
        if (!newModule) {
          if (typeof hot.invalidate === 'function') {
            hot.invalidate();
          } else if (typeof location !== 'undefined') {
            location.reload();
          }
          return;
        }

        // Extract HMR components from new module
        const newRegistry = extractHMRComponents(newModule);
        if (newRegistry.length === 0) {
          return;
        }

        const needsReload = applyUpdate(newRegistry);
        if (needsReload) {
          if (typeof hot.invalidate === 'function') {
            hot.invalidate();
          } else if (typeof location !== 'undefined') {
            location.reload();
          }
        }
      });
    } catch {
      // If accept callback not supported, use simple accept
      hot.accept();
    }
  }

  // Setup dispose handler
  if (typeof hot.dispose === 'function') {
    hot.dispose(data => {
      data.__$registry$__ = registry;
      data.__essor_timestamp__ = Date.now();
    });
  }

  // Apply update if previous data exists
  if (hot.data?.__$registry$__) {
    const needsReload = applyUpdate(registry);
    if (needsReload) {
      if (typeof hot.invalidate === 'function') {
        hot.invalidate();
      } else if (typeof location !== 'undefined') {
        location.reload();
      }
    }
  }
}

/**
 * Extract HMR components from a module
 *
 * Looks for __$registry$__ array first (generated by babel plugin),
 * then falls back to scanning all exports for HMR components
 *
 * @param module - Module object to scan
 * @returns Array of HMR component functions
 */
function extractHMRComponents(module) {
  if (!module) return [];

  // Prefer __$registry$__
  if (Array.isArray(module.__$registry$__)) {
    return module.__$registry$__;
  }

  // Otherwise search in exports
  const components = [];
  for (const key of Object.keys(module)) {
    const value = module[key];
    if (isHMRComponent(value)) {
      components.push(value);
    }
  }
  return components;
}

/**
 * Main HMR entry point
 *
 * Called from transformed modules to set up HMR based on bundler type
 *
 * @param bundlerType - Type of bundler (vite, webpack5, rspack, etc.)
 * @param hot - Hot module API object (import.meta.hot or module.hot)
 * @param registry - Array of components from current module
 * @returns true if HMR setup succeeded, false otherwise
 */
export function hmrAccept(bundlerType, hot, registry) {
  if (!hot || !registry || registry.length === 0) {
    return false;
  }

  switch (bundlerType) {
    case 'vite':
      setupViteHMR(hot, registry);
      break;
    case 'webpack':
    case 'rspack':
      setupWebpackHMR(hot, registry);
      break;
    default:
      // Use standard HMR setup
      setupStandardHMR(hot, registry);
      break;
  }

  return true;
}

/**
 * Cleanup all instances of a component (utility function)
 *
 * @param hmrId - Component HMR ID
 * @returns Number of instances cleaned up
 */
export function unregisterAllInstances(hmrId) {
  const info = componentRegistry.get(hmrId);
  if (!info) return 0;

  let count = 0;
  for (const item of info.instances) {
    const cleanup = info.cleanups.get(item);
    if (cleanup) {
      try {
        cleanup();
      } catch (error) {
        console.error(`[Essor HMR] Failed to cleanup effect:`, error);
      }
    }
    count++;
  }

  info.instances.clear();

  return count;
}

/**
 * Get registry information for debugging
 *
 * @returns Object mapping hmrId to component info (signature, instance count)
 */
export function getRegistryInfo() {
  const info = {};
  for (const [id, data] of componentRegistry) {
    info[id] = {
      signature: data.signature,
      instanceCount: data.instances.size,
    };
  }
  return info;
}
