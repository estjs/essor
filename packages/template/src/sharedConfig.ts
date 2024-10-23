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
export const STYLE_KEY = 'style';
export const REF_KEY = 'ref';

export const PLACEHOLDER = ' __PLACEHOLDER__ ';

// Enum to represent different types of components
export enum ComponentType {
  TEXT,
  TEXT_COMPONENT,
  COMPONENT,
}

class RenderContext {
  renderMode = RENDER_MODE.CLIENT;

  get isSSG() {
    return this.renderMode === RENDER_MODE.SSG;
  }

  get isSSR() {
    return this.renderMode === RENDER_MODE.SSR;
  }

  get isClient() {
    return this.renderMode === RENDER_MODE.CLIENT;
  }

  setSSR() {
    this.renderMode = RENDER_MODE.SSR;
  }

  setSSG() {
    this.renderMode = RENDER_MODE.SSG;
  }

  setClient() {
    this.renderMode = RENDER_MODE.CLIENT;
  }
}

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
  return componentMap.get(temp)?.index;
}
