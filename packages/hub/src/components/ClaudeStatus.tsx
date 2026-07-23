"use client";

import { useEffect, useState, useCallback } from "react";

type State = "checking" | "online" | "offline";

export function ClaudeStatus() {
  const [state, setState] = useState<State>("checking");
  const [reason, setReason] = useState<string>("");

  const check = useCallback(async (fresh = false) => {
    setState("checking");
    try {
      const r = await fetch(`/api/health${fresh ? "?fresh=1" : ""}`, { cache: "no-store" });
      const j = await r.json();
      setState(j.claude?.online ? "online" : "offline");
      setReason(j.claude?.reason ?? "");
    } catch {
      setState("offline");
      setReason("hub unreachable");
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  const label = state === "checking" ? "Claude: checking…" : state === "online" ? "Claude online" : "Claude offline";
  return (
    <button
      className={`statusbadge ${state}`}
      title={reason ? `${label} — ${reason} (click to recheck)` : `${label} (click to recheck)`}
      onClick={() => check(true)}
    >
      <span className="dot" />
      {label}
    </button>
  );
}
