import { NextResponse } from "next/server";

// The hub is local + single-user; the autofill extension calls these routes
// from a chrome-extension:// origin, so allow any origin for the localhost API.
export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function corsJson(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { ...CORS, ...(init?.headers ?? {}) } });
}

/** Preflight handler — re-export as `OPTIONS` from each route. */
export function preflight() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
