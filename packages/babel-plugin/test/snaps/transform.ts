import babel from '@babel/core';
import myPlugin from '../../src/index';

/**
 * 为了尽可能少地修改几百个测试用例文件，这里保留旧版的签名 getTransform(name, opts)。
 * 新版架构由于高度凝聚（Signal pass + JSX pass + HMR pass 构成一条流水线），
 * 我们将不再区分独立的 jsx 或 symbol transform 测试跑法，而是统一返回主插件。
 */
export function getTransform(
  transformName: string | string[],
  opts: Record<string, unknown> = {},
): (code: string) => string {
  return code => {
    const result = babel.transformSync(code, {
      filename: 'test.jsx',
      sourceType: 'module',
      plugins: [[myPlugin, opts]],
    });

    if (result?.code) {
      return result.code;
    }
    return code;
  };
}
