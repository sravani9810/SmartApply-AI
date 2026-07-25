"use client";

import { useState, useTransition } from "react";
import type { ResumeData } from "@smartapply/shared";
import { composeResumeAction, saveResumeData, type ComposeResult } from "../db/actions";
import type { ComposeState } from "../lib/compose";
import { EditableResumePreview } from "./EditableResumePreview";

/**
 * A saved résumé's editor: inline-edit the résumé directly (click any text),
 * ask Claude to refine it (reselects from your bullet library), and Save — all
 * in the hub, no bounce to the Part 4 builder. Seeded with the résumé's derived
 * state so Claude edits build on what's already there.
 */
export function ResumeRefiner({
  resumeId,
  initialData,
  initialState,
  initialLog,
  initialLabel,
  jd,
  flavorId,
  targetRole,
}: {
  resumeId: string;
  initialData: ResumeData;
  initialState: ComposeState;
  initialLog: string[];
  initialLabel: string;
  jd?: string;
  flavorId?: string;
  targetRole?: string;
}) {
  const [data, setData] = useState<ResumeData>(initialData);
  const [state, setState] = useState<ComposeState>(initialState);
  const [log, setLog] = useState<string[]>(initialLog);
  const [label, setLabel] = useState(initialLabel);
  const [dirty, setDirty] = useState(false);
  const [followup, setFollowup] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "refine" | "save">("");
  const [pending, startTransition] = useTransition();

  const refine = () =>
    startTransition(async () => {
      if (!followup.trim()) return;
      setBusy("refine");
      setError(null);
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
        setDirty(false);
        setNote("Applied Claude edit.");
      } else {
        setError(r.error ?? "refine failed");
      }
      setBusy("");
    });

  const save = () =>
    startTransition(async () => {
      setBusy("save");
      setError(null);
      const r = await saveResumeData(resumeId, data, label);
      if (r.ok) {
        setDirty(false);
        setNote("Saved.");
      } else {
        setError(r.error ?? "save failed");
      }
      setBusy("");
    });

  return (
    <div className={pending ? "pending" : ""}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 8 }}>
        <label className="fld" style={{ flex: 1, minWidth: 220 }}>
          <span>Résumé name</span>
          <input className="status" value={label} onChange={(e) => { setLabel(e.target.value); setDirty(true); }} placeholder="Résumé name" />
        </label>
        <div className="rowacts">
          {dirty ? <span className="pill miss" style={{ marginRight: 6 }}>unsaved edits</span> : null}
          <button className="btn on" onClick={save} disabled={pending}>{busy === "save" ? "Saving…" : "Save"}</button>
        </div>
      </div>

      <div className="followup" style={{ marginTop: 12 }}>
        <span className="fu-label">Ask Claude to change this résumé</span>
        <div className="fu-row">
          <input
            className="status" style={{ flex: 1 }} value={followup}
            onChange={(e) => setFollowup(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") refine(); }}
            placeholder="e.g. make it shorter, add Docker, move Oracle to the top, drop the Capgemini role"
            disabled={pending}
          />
          <button className="btn on" onClick={refine} disabled={pending || !followup.trim()}>
            {busy === "refine" ? "Refining…" : "Apply"}
          </button>
        </div>
        {error ? <p className="err">⚠ {error}</p> : null}
        {note ? <p className="muted" style={{ fontSize: 12 }}>{note}</p> : null}
        {log.length ? (
          <ol className="fu-log">
            {log.map((line, i) => <li key={i}>{line}</li>)}
          </ol>
        ) : null}
      </div>

      <p className="rp-hint">Click any text on the résumé to edit it inline. Changes are saved when you press <b>Save</b>.</p>
      <div className="rp-editing">
        <EditableResumePreview data={data} onChange={(next) => { setData(next); setDirty(true); }} />
      </div>
    </div>
  );
}
