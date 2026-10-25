/**
 * macro-http.ts — thin Node HTTP adapter around createMacroApi (no framework needed).
 * In an Express/Fastify/Hono app, skip this file and call api.handle({method, path, query, body}).
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { MacroApi } from './macro-api';

const MAX_BODY = 1_000_000;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: string[] = [];
    req.on('data', (c: { toString(): string; length: number }) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('body-too-large'));
        req.destroy();
        return;
      }
      chunks.push(c.toString());
    });
    req.on('end', () => resolve(chunks.join('')));
    req.on('error', reject);
  });
}

export function startMacroServer(api: MacroApi, opts: { port?: number; host?: string; allowOrigin?: string } = {}): Promise<{ server: Server; port: number; close: () => Promise<void> }> {
  const server = createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (opts.allowOrigin) {
        res.setHeader('Access-Control-Allow-Origin', opts.allowOrigin);
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      }
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method === 'OPTIONS') return send(204, {});
      const url = new URL(req.url ?? '/', 'http://localhost');
      const query: Record<string, string> = {};
      url.searchParams.forEach((v, k) => (query[k] = v));
      let body: unknown = undefined;
      if (req.method === 'POST') {
        const raw = await readBody(req);
        if (raw.trim()) {
          try {
            body = JSON.parse(raw);
          } catch {
            return send(400, { error: 'Nội dung JSON không hợp lệ.' });
          }
        }
      }
      const out = await api.handle({ method: req.method ?? 'GET', path: url.pathname, query, body });
      return send(out.status, out.body);
    } catch (e) {
      if (e instanceof Error && e.message === 'body-too-large') return send(413, { error: 'Nội dung quá lớn.' });
      return send(500, { error: 'Lỗi máy chủ.' });
    }
  });
  return new Promise((resolve) => {
    server.listen(opts.port ?? 0, opts.host ?? '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, port, close: () => new Promise<void>((r) => server.close(() => r())) });
    });
  });
}
