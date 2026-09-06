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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), xaiProxy(env)],
    // The V3Artboard runtime imports its dev-mode helpers as '@/…', the way it does in the
    // project it came from. Keeping the alias means the runtime can be re-copied verbatim.
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  };
});
