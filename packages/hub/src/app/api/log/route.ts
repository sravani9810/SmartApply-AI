import { corsJson, preflight } from "../../../lib/http";
import { logInfo, logWarn, logError } from "../../../lib/log";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * POST /api/log — the autofill extension ships Auto-pilot events here so they
 * print in the hub terminal (the `npm run hub` window), giving you live
 * visibility into what the agent is doing. Body: { level, scope, message, data }.
 */
export async function POST(req: Request) {
  let body: { level?: string; scope?: string; message?: string; data?: unknown };
  try { body = await req.json(); } catch { return corsJson({ ok: false }, { status: 400 }); }

  const scope = `ext:${String(body.scope || "autopilot").slice(0, 40)}`;
  const message = String(body.message ?? "").slice(0, 1000);
  const data = body.data;
  const withData = data !== undefined && data !== null
    ? `${message} ${typeof data === "string" ? data : JSON.stringify(data)}`
    : message;

  if (body.level === "error") logError(scope, message, typeof data === "object" && data ? (data as Record<string, unknown>) : undefined);
  else if (body.level === "warn") logWarn(scope, withData);
  else logInfo(scope, withData);

  return corsJson({ ok: true });
}
