import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/* The xAI seam.
 *
 * The dayboard calls /api/xai, never api.x.ai directly, so no key ever lands in the bundle a
 * browser can read. Two upstreams, checked in this order:
 *
 *   LLM_PROXY_URL + LLM_PROXY_TOKEN   Spacetime's `llm-proxy` Supabase edge function. The xAI
 *                                     key lives in Supabase's secrets and stays there; this
 *                                     machine only holds the project's anon token. Preferred —
 *                                     nothing to extract, nothing to rotate here.
 *   XAI_API_KEY                       api.x.ai directly, for anyone without Supabase access.
 *
 * Neither set: 503 with a plain reason, the page falls back to its local read, and the status
 * line says so. The board must never look like a model ran when one did not.
 *
 * llm-proxy forwards only {model, messages, tools, max_tokens}: response_format and
 * temperature are dropped on the floor. The agent's prompt is written to survive that.
 */
function xaiProxy(env: Record<string, string>): Plugin {
  return {
    name: 'xai-proxy',
    configureServer(server) {
      server.middlewares.use('/api/xai', async (req, res) => {
        const get = (k: string) => env[k] || process.env[k] || '';
        const proxyUrl = get('LLM_PROXY_URL'), proxyToken = get('LLM_PROXY_TOKEN'), key = get('XAI_API_KEY');
        const fail = (code: number, message: string) => {
          res.statusCode = code;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: message }));
        };
        if (req.method !== 'POST') return fail(405, 'POST only');
        const upstreamUrl = proxyUrl && proxyToken ? proxyUrl : key ? 'https://api.x.ai/v1/chat/completions' : '';
        if (!upstreamUrl) return fail(503, 'No model upstream — set LLM_PROXY_URL + LLM_PROXY_TOKEN, or XAI_API_KEY, in environment/.env.local and restart');
        const auth = proxyUrl && proxyToken ? proxyToken : key;

        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        try {
          const upstream = await fetch(upstreamUrl, {
            method: 'POST',
            // Supabase gateways want the anon token as `apikey` too; api.x.ai ignores it.
            headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}`, apikey: auth },
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

/* The OpenAI seam — the same shape as the xAI one, for /clouds.
 *
 * When a voice session ends, clouds-session.ts POSTs the transcript here and the dev server
 * forwards it to chat/completions with OPENAI_API_KEY from environment/.env.local (gitignored;
 * the key came from another project's env and is never committed here). GET answers whether a
 * key is configured, so the page can say up front which read you will get. 503 with no key —
 * the page falls back to its local keyword read and labels it as such.
 */
function openaiProxy(env: Record<string, string>): Plugin {
  return {
    name: 'openai-proxy',
    configureServer(server) {
      server.middlewares.use('/api/openai', async (req, res) => {
        const key = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
        const model = env.OPENAI_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';
        const send = (code: number, body: unknown) => {
          res.statusCode = code;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (req.method === 'GET') return send(200, { configured: Boolean(key), model });
        if (req.method !== 'POST') return send(405, { error: 'POST only' });
        if (!key) return send(503, { error: 'OPENAI_API_KEY is not set — add it to environment/.env.local and restart' });

        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        try {
          // Fill in the model server-side so the client never names one.
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          if (!body.model) body.model = model;
          const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
            body: JSON.stringify(body),
          });
          res.statusCode = upstream.status;
          res.setHeader('content-type', 'application/json');
          res.end(await upstream.text());
        } catch (e) {
          send(502, { error: e instanceof Error ? e.message : String(e) });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), xaiProxy(env), openaiProxy(env)],
    // The V3Artboard runtime imports its dev-mode helpers as '@/…', the way it does in the
    // project it came from. Keeping the alias means the runtime can be re-copied verbatim.
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  };
});
