import fs from 'node:fs';
import path from 'node:path';
import pkg from '../package.json';

(() => {
  const srcPath = path.join(path.resolve(), './packages/core/src');
  const version = pkg.version;
  fs.writeFileSync(
    path.resolve(srcPath, 'version.ts'),
    `export const aube_version = '${version}';\n`,
  );
})();
