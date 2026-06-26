import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, resolve } from 'node:path';
import { createServer } from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const distDir = process.env.DIST_DIR || 'dist';
const clientDir = resolve(__dirname, distDir, 'client');
const serverEntry = resolve(__dirname, distDir, 'server/entry-server.js');

function getPortArg() {
  const rawArg = process.argv.find((arg) => arg.startsWith('--port='));
  if (rawArg) {
    const value = Number(rawArg.split('=')[1]);
    if (!Number.isNaN(value)) return value;
  }

  const index = process.argv.findIndex((arg) => arg === '--port' || arg === '-p');
  if (index >= 0) {
    const value = Number(process.argv[index + 1]);
    if (!Number.isNaN(value)) return value;
  }

  return null;
}

const port = getPortArg() || Number(process.env.PORT) || 3020;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

function renderDocument(template, html) {
  return template.replace('<!--ssr-outlet-->', html);
}

// --- Vite (development only) -------------------------------------------------

let vite;
if (!isProduction) {
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });
}

// --- Static file serving (production only) -----------------------------------

function tryServeStatic(req, res) {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/' || urlPath.endsWith('/')) return false;

  const filePath = join(clientDir, urlPath);
  // Guard against path traversal outside the client output dir.
  if (!filePath.startsWith(clientDir)) return false;
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return false;

  const type = MIME[extname(filePath)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  createReadStream(filePath).pipe(res);
  return true;
}

// --- SSR / SSG request handler -----------------------------------------------

async function handleRequest(req, res) {
  try {
    const url = req.url || '/';
    let template;
    let render;

    if (!isProduction) {
      // Dev: read the raw template, let Vite transform it (HMR client, etc.),
      // then compile the server entry on the fly.
      template = readFileSync(resolve(__dirname, 'index.html'), 'utf-8');
      template = await vite.transformIndexHtml(url, template);
      ({ render } = await vite.ssrLoadModule('/src/entry-server.tsx'));
    } else {
      const isSsr = process.env.RENDER_MODE === 'ssr';
      const templatePath = isSsr
        ? resolve(clientDir, 'index.ssr.html')
        : resolve(clientDir, 'index.html');
      template = readFileSync(templatePath, 'utf-8');

      // SSG: if not explicitly SSR, and the template has already had the outlet
      // replaced, serve it as a static shell.
      if (!isSsr && !template.includes('<!--ssr-outlet-->')) {
        console.log(`[SSG] static shell  ${url}`);
        send(res, 200, 'text/html; charset=utf-8', template);
        return;
      }

      // SSR: render dynamically from the prebuilt server bundle.
      ({ render } = await import(serverEntry));
    }

    const { html } = render();
    const templateHtml = renderDocument(template, html);

    console.log(`[SSR] rendered      ${url}`);
    send(res, 200, 'text/html; charset=utf-8', templateHtml);
  } catch (error) {
    if (!isProduction && vite) vite.ssrFixStacktrace(error);
    console.error(`SSR error: ${error.stack || error.message}`);
    send(res, 500, 'text/plain; charset=utf-8', error.stack || error.message);
  }
}

const server = createServer((req, res) => {
  if (!isProduction) {
    // Vite middleware serves /src, /@vite, /node_modules deps, then falls
    // through to our SSR handler for the document request.
    vite.middlewares(req, res, () => handleRequest(req, res));
    return;
  }

  if (tryServeStatic(req, res)) return;
  handleRequest(req, res);
});

server.listen(port, () => {
  console.log(`✨ Isomorphic server running at http://localhost:${port}`);
  console.log(`📦 Mode: ${isProduction ? 'production' : 'development'}`);
});
