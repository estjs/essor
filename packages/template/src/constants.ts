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

// 添加一个辅助函数来检查是否为 HYDRATE 模式
export function isHydrateMode() {
  return sharedConfig.renderType === RENDER_TYPE.HYDRATE;
}
