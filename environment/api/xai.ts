// The xAI seam, deployed. Mirrors the dev-server proxy in vite.config.ts:
// the dayboard POSTs here, never api.x.ai directly. Two upstreams, in
// order: Spacetime's llm-proxy (LLM_PROXY_URL + LLM_PROXY_TOKEN), else
// api.x.ai with XAI_API_KEY. Neither set: 503 and the board's local read.

export async function POST(req: Request): Promise<Response> {
  const proxyUrl = process.env.LLM_PROXY_URL || "";
  const proxyToken = process.env.LLM_PROXY_TOKEN || "";
  const key = process.env.XAI_API_KEY || "";
  const upstreamUrl = proxyUrl && proxyToken ? proxyUrl : key ? "https://api.x.ai/v1/chat/completions" : "";
  if (!upstreamUrl) {
    return Response.json(
      { error: "No model upstream — set LLM_PROXY_URL + LLM_PROXY_TOKEN, or XAI_API_KEY" },
      { status: 503 }
    );
  }
  const auth = proxyUrl && proxyToken ? proxyToken : key;
  try {
    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      // Supabase gateways want the anon token as `apikey` too; api.x.ai ignores it.
      headers: { "content-type": "application/json", authorization: `Bearer ${auth}`, apikey: auth },
      body: await req.text(),
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
