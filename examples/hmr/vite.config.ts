import { defineConfig } from 'vite';
import essor from 'unplugin-essor/vite';
import Inspect from 'vite-plugin-inspect';
export default defineConfig({
  plugins: [Inspect(), essor({ hmr: true })],
});
