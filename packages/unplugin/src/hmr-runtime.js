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

const isFunction = (value) => typeof value === 'function';
const ESSOR_HMR = 'essor-hmr';
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

function stopRunner(runner) {
  if (!runner) return;
  if (isFunction(runner.stop)) {
    runner.stop();
    return;
  }
  if (isFunction(runner)) {
    runner();
  }
}

function cleanupInstance(info, component) {
  const runner = info.cleanups.get(component);
  try {
    if (runner) {
      stopRunner(runner);
    }
  } finally {
    info.cleanups.delete(component);
    info.instances.delete(component);
  }
}

/**
 * Utility function to handle invalidate or reload
 * @param hot - Hot module API object
 */
function invalidateOrReload(hot) {
  if (isFunction(hot?.invalidate)) {
    hot.invalidate();
  } else if (typeof location !== 'undefined') {
    location.reload();
  }
}

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
  } else if (info.instances.size === 0) {
    info.signature = signature;
    info.componentSignal.value = componentFn;
  }

  // Create Component instance from the current registry entry. This matters
  // when an old closure creates a new instance after the module was updated.
  const currentComponentFn = info.componentSignal.value;
  const component = createComponent(currentComponentFn, props);
  // Track this instance
  info.instances.add(component);

  // Create effect for this Component instance
  // The effect subscribes to componentSignal and updates the component
  // We read the signal value immediately to establish the dependency,
  // but only trigger updates on subsequent changes
  let initialized = false;
  const runner = effect(() => {
    // Read signal value to establish dependency
    const currentComponentFn = info.componentSignal.value;
    // Skip the initialization run - only update on actual changes
    if (!initialized) {
      initialized = true;
      return;
    }

    // Update this specific instance when signal changes
    try {
      component.component = currentComponentFn;
      component.forceUpdate();
    } catch (error) {
      console.error(`[Essor HMR] Failed to update component instance:`, error);
    }
  });

  // Store cleanup function for this instance
  info.cleanups.set(component, runner);

  let disposed = false;
  const cleanupHMR = () => {
    if (disposed) return;
    disposed = true;
    cleanupInstance(info, component);
  };

  const originalForceUpdate = component.forceUpdate;
  let isForceUpdating = false;
  if (isFunction(originalForceUpdate)) {
    component.forceUpdate = function (...args) {
      isForceUpdating = true;
      try {
        return originalForceUpdate.apply(this, args);
      } finally {
        isForceUpdating = false;
      }
    };
  }

  // Integrate with component lifecycle - cleanup only when the component is
  // actually unmounted, not during forceUpdate's destroy/remount cycle.
  const originalDestroy = component.destroy;
  component.destroy = function (...args) {
    try {
      if (isFunction(originalDestroy)) {
        return originalDestroy.apply(this, args);
      }
    } finally {
      if (!isForceUpdating) {
        cleanupHMR();
      }
    }
  };

  return component;
}

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
  return value && isFunction(value) && value.__hmrId;
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
    if (!isHMRComponent(entry)) {
      continue;
    }

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
 * Common handler for HMR updates across bundlers
 * @param hot - Hot module API
 * @param newModule - Updated module
 * @returns true if handled successfully
 */
function handleHMRUpdate(hot, newModule) {
  if (!newModule) {
    invalidateOrReload(hot);
    return false;
  }

  // Extract HMR components from new module
  const newRegistry = extractHMRComponents(newModule);
  if (newRegistry.length === 0) {
    return true;
  }

  const needsReload = applyUpdate(newRegistry);
  if (needsReload) {
    invalidateOrReload(hot);
  }
  return true;
}

/**
 * Setup HMR for Vite bundler
 *
 * Vite provides import.meta.hot.accept() callback that receives the new module
 */
function setupViteHMR(hot, registry) {
  hot.data ??= {};
  const isUpdate = !!hot.data[ESSOR_HMR];
  hot.data[ESSOR_HMR] = registry;

  if (isUpdate) {
    const needsReload = applyUpdate(registry);
    if (needsReload) {
      invalidateOrReload(hot);
    }
  }
}

/**
 * Setup HMR for Webpack/Rspack bundlers
 *
 * Webpack-style HMR uses module.hot.accept() and hot.data for state persistence
 */
function setupWebpackHMR(hot, registry) {
  if (isFunction(hot.accept)) {
    hot.accept();
  }

  // Apply update if previous data exists from last hot reload
  if (hot.data?.[ESSOR_HMR]) {
    const needsReload = applyUpdate(registry);
    if (needsReload) {
      invalidateOrReload(hot);
    }
  }

  // Save current registry for next update
  if (isFunction(hot.dispose)) {
    hot.dispose((data) => {
      data[ESSOR_HMR] = registry;
    });
  }
}

/**
 * Setup HMR for other bundlers (fallback)
 *
 * Attempts to work with any bundler that provides a basic hot module API
 */
function setupStandardHMR(hot, registry) {
  // Try accept callback mode first (more efficient)
  if (isFunction(hot.accept)) {
    try {
      hot.accept((newModule) => handleHMRUpdate(hot, newModule));
    } catch {
      // Some bundlers don't support accept with callback
      // Fall back to simple accept (for Webpack-style pattern)
      try {
        hot.accept();
      } catch (error_) {
        console.warn('[Essor HMR] Failed to setup hot.accept:', error_);
      }
    }
  }

  // Setup dispose handler for state persistence
  if (isFunction(hot.dispose)) {
    hot.dispose((data) => {
      data.__$registry$__ = registry;
      data.__essor_timestamp__ = Date.now();
    });
  }

  // Apply update if previous data exists (for Webpack-style HMR)
  if (hot.data?.__$registry$__) {
    const needsReload = applyUpdate(registry);
    if (needsReload) {
      invalidateOrReload(hot);
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
  if (!hot || !registry) {
    return false;
  }

  switch (bundlerType) {
    case 'vite':
      setupViteHMR(hot, registry);
      break;
    case 'webpack':
    case 'webpack5':
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
  for (const item of [...info.instances]) {
    try {
      cleanupInstance(info, item);
    } catch (error) {
      console.error(`[Essor HMR] Failed to cleanup effect:`, error);
    }
    count++;
  }

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
