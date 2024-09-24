/**
 *  framework render type
 *
 *  CLIENT: client side
 *  SSR: server side render
 *  SSG: server side generate
 *  HYDRATE:
 */
export enum RENDER_MODE {
  CLIENT,
  SSG,
  SSR,
}

export const globalConfig = {
  renderMode: RENDER_MODE.CLIENT,
};

export const isClient = () => globalConfig.renderMode === RENDER_MODE.CLIENT;
export const isSSR = () => globalConfig.renderMode === RENDER_MODE.SSR;
export const isSSG = () => globalConfig.renderMode === RENDER_MODE.SSG;
