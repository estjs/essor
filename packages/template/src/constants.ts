/**
 *  farmework render type
 *
 *  CLIENT: client side
 *  SSR: server side render
 *  SSG: server side generate
 *  HYDRATE:
 */
export enum RENDER_TYPE {
  CLIENT,
  SSG,
  SSR,
  HYDRATE,
}

export const sharedConfig = {
  renderType: RENDER_TYPE.CLIENT,
};
