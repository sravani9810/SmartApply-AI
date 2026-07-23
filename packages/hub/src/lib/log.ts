/**
 * Minimal server-side logger. Output prints to the hub's server process, which
 * you see live in the `npm run dev` / `npm run hub` terminal (concurrently
 * streams it under the [hub] prefix). Grep-friendly: filter with `ERROR` / `WARN`.
 */
function stamp(): string {
  return new Date().toISOString();
}

export function logError(scope: string, err: unknown, extra?: Record<string, unknown>): void {
  const e = err as Error;
  const msg = e?.message ?? String(err);
  console.error(`✖ ERROR [${scope}] ${stamp()} — ${msg}${extra ? " " + JSON.stringify(extra) : ""}`);
  if (e?.stack) console.error(e.stack);
}

export function logWarn(scope: string, msg: string): void {
  console.warn(`⚠ WARN [${scope}] ${stamp()} — ${msg}`);
}

export function logInfo(scope: string, msg: string): void {
  console.log(`· [${scope}] ${stamp()} — ${msg}`);
}
