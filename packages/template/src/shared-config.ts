const componentMap = new Map();

/**
 *  framework render type
 *
 *  CLIENT: client side
 *  SSR: server side render
 *  SSG: server side generate
 */
export enum RENDER_MODE {
  CLIENT,
  SSG,
  SSR,
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

export function enterComponent(temp, index) {
  componentMap.set(temp, {
    index,
  });
}

export function getComponentIndex(temp) {
  return componentMap.get(temp).index;
}
