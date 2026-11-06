import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { allow, envFrom, forge, parseRequest } from './src/server/forge.ts';

/** Serves /api/* inside the dev server so one `bun dev` runs everything. */
function forgeApi(env: Record<string, string>): Plugin {
  const forgeEnv = envFrom(env);
  return {
    name: 'paper-shoot-forge',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (req.url === '/api/health') return send(200, { ai: Boolean(forgeEnv.apiKey), model: forgeEnv.model });
        if (req.url === '/api/forge' && req.method === 'POST') {
          if (!allow(req.socket.remoteAddress ?? 'local')) return send(429, { ok: false, error: 'rate-limited' });
          let raw = '';
          for await (const chunk of req) {
            raw += chunk;
            if (raw.length > 4000) return send(413, { ok: false, error: 'too-large' });
          }
          let parsed: ReturnType<typeof parseRequest> = null;
          try {
            parsed = parseRequest(JSON.parse(raw));
          } catch {
            parsed = null;
          }
          if (!parsed) return send(400, { ok: false, error: 'bad-request' });
          return send(200, await forge(parsed, forgeEnv));
        }
        send(404, { ok: false, error: 'not-found' });
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  // '' prefix: read every var, but only on the server. Nothing here is exposed to the client bundle.
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') } as Record<string, string>;
  return {
    plugins: [react(), forgeApi(env)],
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: { manualChunks: id => (id.includes('node_modules/three') ? 'three' : undefined) }
      }
    }
  };
});
