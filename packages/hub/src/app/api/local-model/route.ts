import { corsJson, preflight } from "../../../lib/http";
import { checkLocalModel, chatLocalModel, defaultModel } from "../../../lib/ollama";

export const dynamic = "force-dynamic";
export const maxDuration = 130;
export const OPTIONS = preflight;

/**
 * GET /api/local-model?model=gemma3:1b — is the local model reachable and pulled?
 * Returns { state: "on" | "warn" | "off", reason, models }. Drives the popup's
 * Ollama status dot.
 */
export async function GET(req: Request) {
  const model = new URL(req.url).searchParams.get("model") || defaultModel();
  return corsJson(await checkLocalModel(model));
}

/**
 * POST /api/local-model — run one local-model completion on the extension's
 * behalf. The extension cannot call Ollama directly: Ollama rejects
 * chrome-extension:// origins with a 403, while the hub (a server, sending no
 * Origin) is unaffected. Body: { model?, messages, format?, think?, keep_alive?,
 * options? }. Returns { ok, content }.
 */
export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return corsJson({ ok: false, error: "invalid JSON" }, { status: 400 }); }

  const b = body as { messages?: Array<{ role: string; content: string }> };
  if (!Array.isArray(b.messages) || b.messages.length === 0) {
    return corsJson({ ok: false, error: "messages required" }, { status: 400 });
  }

  try {
    const content = await chatLocalModel(body as Parameters<typeof chatLocalModel>[0]);
    return corsJson({ ok: true, content });
  } catch (err) {
    return corsJson({ ok: false, error: (err as Error).message }, { status: 502 });
  }
}
