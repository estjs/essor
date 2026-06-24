/**
 * Essor HMR Runtime - Registry-based Hot Module Replacement
 *
 * This runtime enables precise component-level HMR updates without full page reloads:
 *
 * 1. **Registry Tracking**: Each component id points to its latest implementation
 * 2. **Signature Tracking**: Components are tracked by code signatures (from babel plugin)
 * 3. **Precise Updates**: Only components with changed signatures are updated
 * 4. **Instance Reloading**: Live component instances remount when their implementation changes
 * 5. **Bundler Agnostic**: Works with Vite, Webpack, Rspack, and other bundlers
 */
import { createComponent, onDestroy } from 'essor';

const isFunction = (value) => typeof value === 'function';
const ESSOR_HMR = 'essor-hmr';
/**
 * Global component registry for HMR tracking
 *
 * Maps hmrId -> ComponentInfo where:
 * - hmrId: Unique identifier for component (fileHash:componentName)
 * - component: Current component function
 * - signature: Hash of component code (changes when code changes)
 * - instances: Set of active component instances
 * - updated: True after HMR applies a newer implementation
 */
const componentRegistry = new Map();

function cleanupInstance(hmrId, info, component) {
  info.instances.delete(component);

  if (info.instances.size === 0 && !info.updated && componentRegistry.get(hmrId) === info) {
    componentRegistry.delete(hmrId);
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
 * 2. Creates the component from the latest registered implementation
 * 3. Tracks the instance until destroy()
 * 4. applyUpdate() remounts tracked instances when the implementation changes
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
    info = {
      component: componentFn,
      signature,
      instances: new Set(),
      updated: false,
    };
    componentRegistry.set(hmrId, info);
  } else if (info.instances.size === 0 && !info.updated) {
    info.signature = signature;
    info.component = componentFn;
  }

  let component;
  let disposed = false;
  let isForceUpdating = false;
  const cleanupHMR = () => {
    if (isForceUpdating) return;
    if (disposed) return;
    disposed = true;
    cleanupInstance(hmrId, info, component);
  };

  // Use a stable boundary function so destroy cleanup is registered only
  // after the component is mounted inside a real Essor scope. This also lets
  // stale closures render the latest implementation after a hot update.
  function HMRBoundary(nextProps) {
    onDestroy(cleanupHMR);
    return info.component.call(this, nextProps);
  }

  component = createComponent(HMRBoundary, props);
  info.instances.add(component);

  const originalForceUpdate = component.forceUpdate;
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
  if (oldInfo.component !== newComponentFn) {
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

function emitHmrEvent(detail) {
  if (typeof CustomEvent !== 'undefined' && typeof dispatchEvent !== 'undefined') {
    dispatchEvent(new CustomEvent('essor:hmr-update', { detail }));
  }
}

/**
 * Apply HMR updates to components
 *
 * Iterates through the new component registry and force-updates live
 * component instances whose implementation changed.
 *
 * @param registry - Array of components from updated module
 * @returns true if reload needed (errors occurred), false otherwise
 */
export function applyUpdate(registry) {
  if (!Array.isArray(registry) || registry.length === 0) {
    return false;
  }

  let needsReload = false;
  const updatedIds = [];

  for (const entry of registry) {
    if (!isHMRComponent(entry)) {
      continue;
    }

    const { __hmrId: hmrId, __signature: signature } = entry;
    const info = componentRegistry.get(hmrId);

    if (!info) {
      componentRegistry.set(hmrId, {
        component: entry,
        signature,
        instances: new Set(),
        updated: true,
      });
      continue;
    }

    // Use shouldUpdate to determine if update is needed
    if (!shouldUpdate(info, entry, signature)) {
      continue;
    }

    info.signature = signature;
    info.component = entry;
    info.updated = true;
    updatedIds.push(hmrId);

    for (const component of [...info.instances]) {
      try {
        component.forceUpdate();
      } catch (error) {
        console.error(`[Essor HMR] Failed to update ${hmrId}:`, error);
        cleanupInstance(hmrId, info, component);
        needsReload = true;
      }
    }
  }

  if (updatedIds.length > 0) {
    emitHmrEvent({ updatedIds });
  }

  return needsReload;
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
    if (applyUpdate(registry)) invalidateOrReload(hot);
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

  if (hot.data?.[ESSOR_HMR]) {
    if (applyUpdate(registry)) invalidateOrReload(hot);
  }

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
  // Try accept with a callback that receives the new module.
  if (isFunction(hot.accept)) {
    try {
      hot.accept((newModule) => {
        if (!newModule) {
          invalidateOrReload(hot);
          return;
        }
        const newRegistry = extractHMRComponents(newModule);
        if (newRegistry.length === 0) return;
        if (applyUpdate(newRegistry)) invalidateOrReload(hot);
      });
    } catch {
      // Some bundlers don't support accept with callback — fall back to simple accept.
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
      data[ESSOR_HMR] = registry;
    });
  }

  // Apply update if previous data exists
  if (hot.data?.[ESSOR_HMR]) {
    if (applyUpdate(registry)) invalidateOrReload(hot);
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
