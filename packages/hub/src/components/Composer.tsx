"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { composeResumeAction, type ComposeResult } from "../db/actions";
import { ResumePreview } from "./ResumePreview";

export interface FlavorOption {
  id: string;
  name: string;
}

export function Composer({
  flavors,
  initial,
}: {
  flavors: FlavorOption[];
  initial?: { jd?: string; instructions?: string; flavorId?: string; targetRole?: string };
}) {
  const [jd, setJd] = useState(initial?.jd ?? "");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [flavorId, setFlavorId] = useState(initial?.flavorId ?? "");
  const [targetRole, setTargetRole] = useState(initial?.targetRole ?? "");
  const [result, setResult] = useState<ComposeResult | null>(null);
  const [pending, startTransition] = useTransition();

  const generate = () =>
    startTransition(async () => {
      const r = await composeResumeAction({ jd, instructions, flavorId, targetRole });
      setResult(r);
    });

  return (
    <div className="composer">
      <div className="composer-form">
        <label className="fld">
          <span>Job description</span>
          <textarea
            className="edit" style={{ minHeight: 180 }} value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="Paste the full job description here…"
          />
        </label>

        <label className="fld">
          <span>Edit instructions</span>
          <textarea
            className="edit" style={{ minHeight: 90 }} value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder={'e.g. add Kubernetes and gRPC, remove the Acme role, emphasize backend'}
          />
        </label>

        <div className="composer-opts">
          <label className="fld">
            <span>Base flavor</span>
            <select className="status" value={flavorId} onChange={(e) => setFlavorId(e.target.value)}>
              <option value="">Full library (no preset)</option>
              {flavors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
          <label className="fld">
            <span>Target role</span>
            <input
              className="status" value={targetRole} onChange={(e) => setTargetRole(e.target.value)}
              placeholder="e.g. internship, senior backend"
            />
          </label>
        </div>

        <button className="btn on" onClick={generate} disabled={pending || (!jd.trim() && !instructions.trim())}>
          {pending ? "Composing with Claude…" : "✦ Generate résumé"}
        </button>
        {result && !result.ok ? <p className="err">⚠ {result.error}</p> : null}
      </div>

      {result?.ok && result.data ? (
        <div className="composer-out">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <b>{result.meta?.company || result.meta?.domain || "Résumé"}</b>
              {result.meta?.targetRole ? <span className="muted"> — {result.meta.targetRole}</span> : null}
              <span className="pill" style={{ marginLeft: 8 }}>
                {result.usedClaude ? "Claude" : "deterministic"}
              </span>
            </div>
            <div className="rowacts">
              <a className="btn" href={`/api/resume/${result.resumeId}/pdf`} target="_blank" rel="noreferrer">Download PDF</a>
              <Link className="btn" href={`/resumes/${result.resumeId}`}>Open →</Link>
            </div>
          </div>
          {result.meta?.technologies?.length ? (
            <div className="tags" style={{ margin: "8px 0" }}>
              {result.meta.technologies.map((t) => <span className="pill t" key={t}>{t}</span>)}
            </div>
          ) : null}
          <p className="muted" style={{ fontSize: 12 }}>Saved to your résumé library. Adjust the instructions and generate again to iterate.</p>
          <ResumePreview data={result.data} />
        </div>
      ) : null}
    </div>
  );
}
