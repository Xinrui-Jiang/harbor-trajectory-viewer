import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** GET/POST /api/annotations?dataset=<id> ↔ ./annotations/<id>.json. Unauthenticated: it is a local tool. */
const annotations = (): Plugin => ({
  name: 'annotations',
  configureServer(server) {
    server.middlewares.use('/api/annotations', (req, res) => {
      const id = (new URL(req.url ?? '/', 'http://x').searchParams.get('dataset') ?? 'default').replace(/[^\w.-]+/g, '_').slice(0, 80) || 'default';
      const file = join('annotations', `${id}.json`);
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => { try { const parsed = JSON.parse(body); mkdirSync('annotations', { recursive: true }); writeFileSync(file, JSON.stringify(parsed, null, 1)); res.end('ok'); } catch (e) { res.statusCode = 400; res.end(String(e)); } });
      } else {
        res.setHeader('content-type', 'application/json');
        res.end(existsSync(file) ? readFileSync(file) : '{}');
      }
    });
  },
});

// Only the project and the ingested data root are reachable; `allowedHosts` lets a tunnel hostname reach the dev server.
const real = (p: string) => { try { return realpathSync(p); } catch { return null; } };
const allow = [process.cwd(), real('public/pack'), real('public/data')].filter((p): p is string => !!p);
export default defineConfig({ plugins: [react(), annotations()], server: { fs: { allow }, allowedHosts: true } });
