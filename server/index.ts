/**
 * Production server: `bun run build && bun start`.
 * Serves the built game from ./dist and the forge API, with the key kept here.
 */
import { join, normalize } from 'node:path';
import { allow, envFrom, forge, forgeStream, parseRequest, wantsStream } from '../src/server/forge.ts';

const env = envFrom(process.env);
const root = join(import.meta.dir, '..', 'dist');
const port = Number(process.env.PORT || 4173);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Bun.serve({
  port,
  // a code-skill forge takes 20–60 s; Bun's default would drop it at 10 s of silence
  idleTimeout: 120,
  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === '/api/health') return json(200, { ai: Boolean(env.apiKey), model: env.model });
    if (url.pathname === '/api/forge' && req.method === 'POST') {
      if (!allow(server.requestIP(req)?.address ?? 'unknown')) return json(429, { ok: false, error: 'rate-limited' });
      const text = await req.text();
      if (text.length > 4000) return json(413, { ok: false, error: 'too-large' });
      let parsed: ReturnType<typeof parseRequest> = null;
      try {
        parsed = parseRequest(JSON.parse(text));
      } catch {
        parsed = null;
      }
      if (!parsed) return json(400, { ok: false, error: 'bad-request' });
      if (wantsStream(req.headers.get('accept')))
        return new Response(forgeStream(parsed, env), { headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-cache' } });
      return json(200, await forge(parsed, env));
    }
    if (url.pathname.startsWith('/api/')) return json(404, { ok: false, error: 'not-found' });

    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (rel.includes('..')) return new Response('bad path', { status: 400 });
    const file = Bun.file(join(root, rel || 'index.html'));
    if (rel && (await file.exists())) return new Response(file);
    return new Response(Bun.file(join(root, 'index.html')));
  }
});

console.log(`Paper Shoot on http://localhost:${port}  (AI forge: ${env.apiKey ? env.model : 'offline'})`);
