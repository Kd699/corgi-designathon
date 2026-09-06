// The OpenAI seam, deployed. The same contract as the dev-server proxy in
// vite.config.ts: clouds-session.ts POSTs a chat/completions body here, the
// key is added server-side (OPENAI_API_KEY in Vercel env), and the model is
// filled in when the client leaves it out. GET reports whether a key is
// configured. 503 with no key — the page falls back to its local read.

const MODEL = () => process.env.OPENAI_MODEL || "gpt-4.1-mini";

export function GET(): Response {
  return Response.json({ configured: Boolean(process.env.OPENAI_API_KEY), model: MODEL() });
}

export async function POST(req: Request): Promise<Response> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Response.json({ error: "OPENAI_API_KEY is not set" }, { status: 503 });
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (!body.model) body.model = MODEL();
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
