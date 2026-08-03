// Server-side Ollama client.
//
// The extension used to call http://localhost:11434 directly from its service
// worker, but Ollama enforces an origin allowlist that does not include
// chrome-extension:// — every such request came back 403. The hub is a server,
// not a browser, so it sends no Origin header and is not subject to that check.
// Routing local-model traffic through here removes the whole problem and keeps
// the extension talking to a single origin (the hub).
//
// The Ollama endpoint is configured here, not by the extension, so this never
// becomes a general-purpose proxy to arbitrary hosts.

import { logWarn } from "./log";

const DEFAULT_URL = "http://localhost:11434";
const DEFAULT_MODEL = "gemma3:1b";

export function ollamaUrl(): string {
  return (process.env.OLLAMA_URL || DEFAULT_URL).replace(/\/+$/, "");
}

export function defaultModel(): string {
  return process.env.OLLAMA_MODEL || DEFAULT_MODEL;
}

export interface LocalModelStatus {
  /** "on" = ready, "warn" = server up but model missing, "off" = unreachable. */
  state: "on" | "warn" | "off";
  reason: string;
  models?: string[];
}

/** Is the Ollama server up, and is `want` actually pulled? */
export async function checkLocalModel(want = defaultModel()): Promise<LocalModelStatus> {
  const url = ollamaUrl();
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { state: "off", reason: `Ollama HTTP ${res.status}` };
    const models = (((await res.json()) as { models?: Array<{ name: string }> }).models ?? [])
      .map((m) => m.name);
    const base = want.split(":")[0];
    const has = models.some((n) => n === want || n.split(":")[0] === base);
    return has
      ? { state: "on", reason: `${want} ready`, models }
      : { state: "warn", reason: `Ollama up, but ${want} not pulled (run: ollama pull ${want})`, models };
  } catch (err) {
    return { state: "off", reason: `Ollama not reachable at ${url}: ${(err as Error).message}` };
  }
}

export interface ChatRequest {
  model?: string;
  messages: Array<{ role: string; content: string }>;
  format?: string;
  think?: boolean;
  keep_alive?: string;
  options?: Record<string, unknown>;
}

/**
 * Forward one chat completion to Ollama and return the assistant text.
 * Only the fields we use are passed through — this is a purpose-built shim,
 * not a passthrough for arbitrary request bodies.
 */
export async function chatLocalModel(req: ChatRequest, timeoutMs = 120_000): Promise<string> {
  const url = ollamaUrl();
  const res = await fetch(`${url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: req.model || defaultModel(),
      messages: req.messages,
      stream: false,
      ...(req.format ? { format: req.format } : {}),
      ...(req.think !== undefined ? { think: req.think } : {}),
      ...(req.keep_alive ? { keep_alive: req.keep_alive } : {}),
      ...(req.options ? { options: req.options } : {}),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    logWarn("ollama", `chat failed: HTTP ${res.status} ${detail.slice(0, 200)}`);
    throw new Error(`Ollama HTTP ${res.status}`);
  }
  const j = (await res.json()) as { message?: { content?: string } };
  return j.message?.content ?? "";
}
