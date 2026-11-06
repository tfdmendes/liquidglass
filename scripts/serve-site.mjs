import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from './build-site.mjs';

const base = '/liquidglass/';
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

export async function serveSite(port = 4173) {
  const root = resolve(buildSite());
  const server = createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405, { allow: 'GET, HEAD' }); response.end(); return;
      }
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (pathname === '/' || pathname === base.slice(0, -1)) {
        response.writeHead(302, { location: base }); response.end(); return;
      }
      if (!pathname.startsWith(base)) {
        response.writeHead(404); response.end('Not found'); return;
      }
      let path = resolve(root, pathname.slice(base.length));
      if (path !== root && !path.startsWith(root + sep)) {
        response.writeHead(403); response.end('Forbidden'); return;
      }
      if ((await stat(path)).isDirectory()) {
        if (!pathname.endsWith('/')) {
          response.writeHead(302, { location: pathname + '/' }); response.end(); return;
        }
        path = resolve(path, 'index.html');
      }
      const info = await stat(path);
      if (!info.isFile()) throw Error('Not a file');
      response.writeHead(200, {
        'content-type': types[extname(path)] || 'application/octet-stream',
        'content-length': info.size, 'cache-control': 'no-store',
      });
      if (request.method === 'HEAD') response.end();
      else createReadStream(path).on('error', () => response.destroy()).pipe(response);
    } catch {
      response.writeHead(404); response.end('Not found');
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, url: `http://127.0.0.1:${server.address().port}${base}`, directory: root };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--port')) throw Error('Usage: node scripts/serve-site.mjs [--port 4173]');
  const port = args.length ? Number(args[1]) : 4173;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Use --port with an integer between 0 and 65535');
  const { server, url } = await serveSite(port);
  console.log(`Liquid Glass site: ${url}`);
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
