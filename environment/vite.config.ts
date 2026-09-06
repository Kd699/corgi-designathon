import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/* The xAI seam.
 *
 * The dayboard calls /api/xai, never api.x.ai directly, so XAI_API_KEY stays in the dev
 * server's process and never lands in the bundle a browser can read. Anything shipped to a
 * static host needs a real function in front of it — this is the local-dev equivalent, and
 * it is the only piece of the app that knows a key exists.
 *
 * No key set: the endpoint answers 503 with a plain reason, the page falls back to its local
 * read, and the status line says so. That is deliberate — the board must never look like a
 * model ran when one did not.
 */
function xaiProxy(env: Record<string, string>): Plugin {
  return {
    name: 'xai-proxy',
    configureServer(server) {
      server.middlewares.use('/api/xai', async (req, res) => {
        const key = env.XAI_API_KEY || process.env.XAI_API_KEY;
        const fail = (code: number, message: string) => {
          res.statusCode = code;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: message }));
        };
        if (req.method !== 'POST') return fail(405, 'POST only');
        if (!key) return fail(503, 'XAI_API_KEY is not set — add it to environment/.env.local and restart');

        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        try {
          const upstream = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
            body: Buffer.concat(chunks),
          });
          res.statusCode = upstream.status;
          res.setHeader('content-type', 'application/json');
          res.end(await upstream.text());
        } catch (e) {
          fail(502, e instanceof Error ? e.message : String(e));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), xaiProxy(env)],
    // The V3Artboard runtime imports its dev-mode helpers as '@/…', the way it does in the
    // project it came from. Keeping the alias means the runtime can be re-copied verbatim.
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  };
});
