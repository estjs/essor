/**
 * Framework render type
 *
 * CLIENT: client side
 * SSR: server side render
 * SSG: server side generate
 */
export enum RENDER_MODE {
  CLIENT,
  SSG,
  SSR,
}

export const EVENT_PREFIX = 'on';
export const UPDATE_PREFIX = 'update';
export const CHILDREN_PROP = 'children';

export const EMPTY_TEMPLATE = '';
export const FRAGMENT_PROP_KEY = '0';
export const SINGLE_PROP_KEY = '1';

export const PLACEHOLDER = ' __PLACEHOLDER__ ';

// Enum to represent different types of components
export enum ComponentType {
  TEXT,
  TEXT_COMPONENT,
  COMPONENT,
}

// Class to manage render context
class RenderContext {
  renderMode = RENDER_MODE.CLIENT;

  // Getter to check if the current mode is SSG
  get isSSG() {
    return this.renderMode === RENDER_MODE.SSG;
  }

  // Getter to check if the current mode is SSR
  get isSSR() {
    return this.renderMode === RENDER_MODE.SSR;
  }

  // Getter to check if the current mode is Client
  get isClient() {
    return this.renderMode === RENDER_MODE.CLIENT;
  }

  // Set render mode to SSR
  setSSR() {
    this.renderMode = RENDER_MODE.SSR;
  }

  // Set render mode to SSG
  setSSG() {
    this.renderMode = RENDER_MODE.SSG;
  }

  // Set render mode to Client
  setClient() {
    this.renderMode = RENDER_MODE.CLIENT;
  }
}

// Export a singleton instance of RenderContext
export const renderContext = new RenderContext();

const componentMap = new Map();

// Function to enter a component and set its index
export function enterComponent(temp, index) {
  componentMap.set(temp, {
    index,
  });
}

// Function to get the index of a component
export function getComponentIndex(temp) {
  return componentMap.get(temp).index;
}
