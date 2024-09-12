import express from 'express';
import { renderToString } from 'essor';
import { createApp } from './app.js';
const server = express();
server.get('/', (req, res) => {
  const app = createApp();

  const html = renderToString(app);

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Essor SSR Example</title>
        <script type="module" src="/dist/client.js"></script>
      </head>
      <body>
        <div id="app">${html}</div>
      </body>
    </html>
    `);
});

server.use(express.static('.'));

server.listen(3000, () => {
  console.log('ready');
});
