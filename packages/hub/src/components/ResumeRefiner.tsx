"use client";

import { useState, useTransition } from "react";
import type { ResumeData } from "@smartapply/shared";
import { composeResumeAction, type ComposeResult } from "../db/actions";
import type { ComposeState } from "../lib/compose";
import { ResumePreview } from "./ResumePreview";

/**
 * Follow-up refiner shown on a saved résumé's detail page: keep asking Claude
 * for changes, refining this same résumé in place. Seeded with the résumé's
 * derived state so edits build on what's already there.
 */
export function ResumeRefiner({
  resumeId,
  initialData,
  initialState,
  initialLog,
  jd,
  flavorId,
  targetRole,
}: {
  resumeId: string;
  initialData: ResumeData;
  initialState: ComposeState;
  initialLog: string[];
  jd?: string;
  flavorId?: string;
  targetRole?: string;
}) {
  const [data, setData] = useState<ResumeData>(initialData);
  const [state, setState] = useState<ComposeState>(initialState);
  const [log, setLog] = useState<string[]>(initialLog);
  const [followup, setFollowup] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refine = () =>
    startTransition(async () => {
      if (!followup.trim()) return;
      const r: ComposeResult = await composeResumeAction({
        jd, flavorId, targetRole,
        instructions: followup,
        resumeId,
        current: state,
        priorInstructions: log,
      });
      if (r.ok && r.data) {
        setData(r.data);
        if (r.state) setState(r.state);
        setLog(r.instructionsLog ?? log);
        setFollowup("");
        setError(null);
      } else {
        setError(r.error ?? "refine failed");
      }
    });

  return (
    <div className={pending ? "pending" : ""}>
      <div className="followup">
        <span className="fu-label">Refine this résumé — keep asking for changes</span>
        <div className="fu-row">
          <input
            className="status" style={{ flex: 1 }} value={followup}
            onChange={(e) => setFollowup(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") refine(); }}
            placeholder="e.g. make it shorter, add Docker, move Oracle to the top, drop the Capgemini role"
            disabled={pending}
          />
          <button className="btn on" onClick={refine} disabled={pending || !followup.trim()}>
            {pending ? "Refining…" : "Apply"}
          </button>
        </div>
        {error ? <p className="err">⚠ {error}</p> : null}
        {log.length ? (
          <ol className="fu-log">
            {log.map((line, i) => <li key={i}>{line}</li>)}
          </ol>
        ) : null}
      </div>

      <ResumePreview data={data} />
    </div>
  );
}
