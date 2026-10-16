import unplugin from './index';
import type { Options } from './types';

export default (options: Options): any => ({
  name: 'unplugin-essor',
  hooks: {
    // eslint-disable-next-line require-await
    'astro:config:setup': async (astro: any) => {
      astro.config.vite.plugins ||= [];
      astro.config.vite.plugins.push(unplugin.vite(options));
    },
  },
});
