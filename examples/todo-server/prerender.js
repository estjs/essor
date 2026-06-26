import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientIndex = resolve(__dirname, 'dist/client/index.html');
const serverEntry = resolve(__dirname, 'dist/server/entry-server.js');

async function prerender() {
  const { render } = await import(serverEntry);
  const { html: appHtml } = render();

  const template = readFileSync(clientIndex, 'utf-8');

  // Save the original template (with the placeholder) as index.ssr.html for dynamic SSR requests
  const ssrIndex = resolve(dirname(clientIndex), 'index.ssr.html');
  writeFileSync(ssrIndex, template, 'utf-8');

  const html = template.replace('<!--ssr-outlet-->', appHtml);
  writeFileSync(clientIndex, html, 'utf-8');
  console.log('✨ SSG Pre-rendered successfully!');
}

prerender();
