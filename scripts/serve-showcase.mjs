import { createReadStream, mkdtempSync, rmSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildShowcase } from './build-showcase.mjs';

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.md': 'text/plain' };
export async function serveShowcase(port = 0, { directory } = {}) {
  const temporary = !directory;
  const root = resolve(buildShowcase(directory || mkdtempSync(join(tmpdir(), 'liquidglass-showcase-'))));
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      let path = resolve(root, `.${pathname}`);
      if (path !== root && !path.startsWith(root + sep)) {
        response.writeHead(403); response.end('Forbidden'); return;
      }
      if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
      const info = await stat(path);
      response.writeHead(200, { 'content-type': `${types[extname(path)] || 'text/plain'}; charset=utf-8`, 'content-length': info.size, 'cache-control': 'no-store' });
      createReadStream(path).pipe(response);
    } catch {
      response.writeHead(404); response.end('Not found');
    }
  });
  server.once('close', () => { if (temporary) rmSync(root, { recursive: true, force: true }); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, url: `http://127.0.0.1:${server.address().port}`, directory: root };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--port');
  const port = index < 0 ? 4173 : Number(process.argv[index + 1]);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Use --port with an integer between 0 and 65535');
  const { server, url } = await serveShowcase(port, { directory: fileURLToPath(new URL('../showcase/dist/', import.meta.url)) });
  console.log(`Liquid Glass comparison: ${url}`);
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
