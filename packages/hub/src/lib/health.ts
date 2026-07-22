import { logWarn } from "./log";

export interface ClaudeHealth {
  online: boolean;
  reason?: string;
  checkedAt: string;
}

// A real Claude probe spins up a subscription session, so cache the result for a
// short window instead of probing on every request/poll.
const TTL_MS = 120_000;
let cache: { at: number; result: ClaudeHealth } | null = null;
let inflight: Promise<ClaudeHealth> | null = null;

function short(msg: string): string {
  return msg.length > 160 ? msg.slice(0, 157) + "…" : msg;
}

/** One minimal round-trip to Claude via the Agent SDK, with a timeout. */
async function probeClaude(): Promise<ClaudeHealth> {
  const checkedAt = new Date().toISOString();
  if (process.env.HUB_DISABLE_CLAUDE === "1") {
    return { online: false, reason: "disabled (HUB_DISABLE_CLAUDE=1)", checkedAt };
  }
  try {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const q = query({
      prompt: "Respond with exactly: OK",
      options: {
        maxTurns: 1,
        permissionMode: "bypassPermissions",
        allowedTools: [],
        ...(process.env.HUB_TAILOR_MODEL ? { model: process.env.HUB_TAILOR_MODEL } : {}),
      },
    });
    const consume = (async () => {
      let text = "";
      for await (const m of q as AsyncIterable<Record<string, unknown>>) {
        for (const b of (m.content as Array<Record<string, unknown>> | undefined) ?? [])
          if (b.type === "text" && typeof b.text === "string") text += b.text;
        if (m.type === "result" && typeof m.result === "string") text += m.result;
      }
      return text;
    })();
    const text = await Promise.race([
      consume,
      new Promise<string>((_, rej) => setTimeout(() => rej(new Error("probe timed out")), 20_000)),
    ]);
    return text.trim()
      ? { online: true, checkedAt }
      : { online: false, reason: "no response from Claude", checkedAt };
  } catch (err) {
    const reason = short((err as Error).message || "unknown error");
    logWarn("health.claude", `probe failed: ${reason}`);
    return { online: false, reason, checkedAt };
  }
}

/** Cached Claude connectivity. Pass force=true to bypass the cache. */
export async function checkClaude(force = false): Promise<ClaudeHealth> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.result;
  if (!inflight) {
    inflight = probeClaude().then((result) => {
      cache = { at: Date.now(), result };
      inflight = null;
      return result;
    });
  }
  return inflight;
}
