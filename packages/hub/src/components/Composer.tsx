"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { ResumeData } from "@smartapply/shared";
import {
  composeResumeAction,
  findResumesAction,
  loadResumeAction,
  saveResumeData,
  createResumeFromData,
  linkResumeToJob,
} from "../db/actions";
import type { ComposeState } from "../lib/compose";
import type { FoundResume } from "../lib/findResumes";
import { EditableResumePreview } from "./EditableResumePreview";

export interface FlavorOption {
  id: string;
  name: string;
}

interface Meta {
  company: string;
  domain: string;
  technologies: string[];
  targetRole: string;
}

/** The résumé currently open in the editor surface (generated, found, or refined). */
interface Session {
  resumeId: string;
  data: ResumeData;
  state?: ComposeState;
  log: string[];
  label: string;
  meta: Meta;
  usedClaude?: boolean;
  /** True when inline edits haven't been saved to the DB yet. */
  dirty: boolean;
}

function defaultLabel(meta: Meta): string {
  return [meta.company || meta.domain || "Résumé", meta.targetRole].filter(Boolean).join(" — ") || "Résumé";
}

export function Composer({
  flavors,
  initial,
  job,
}: {
  flavors: FlavorOption[];
  initial?: { jd?: string; instructions?: string; flavorId?: string; targetRole?: string };
  job?: { id: string; title: string };
}) {
  const [jd, setJd] = useState(initial?.jd ?? "");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [flavorId, setFlavorId] = useState(initial?.flavorId ?? "");
  const [targetRole, setTargetRole] = useState(initial?.targetRole ?? "");

  const [finds, setFinds] = useState<FoundResume[] | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [followup, setFollowup] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"" | "generate" | "find" | "refine" | "save" | "saveNew" | "select">("");

  const run = (kind: typeof busy, fn: () => Promise<void>) =>
    startTransition(async () => {
      setBusy(kind);
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy("");
      }
    });

  const maybeLink = async (resumeId: string) => {
    if (job) await linkResumeToJob(resumeId, job.id);
  };

  // Fresh generate → new library entry, opened in the editor.
  const generate = () =>
    run("generate", async () => {
      const r = await composeResumeAction({ jd, instructions, flavorId, targetRole });
      if (!r.ok || !r.data || !r.resumeId) {
        setError(r.error ?? "compose failed");
        return;
      }
      const meta = r.meta ?? { company: "", domain: "", technologies: [], targetRole };
      await maybeLink(r.resumeId);
      setSession({
        resumeId: r.resumeId,
        data: r.data,
        state: r.state,
        log: r.instructionsLog ?? [],
        label: defaultLabel(meta),
        meta,
        usedClaude: r.usedClaude,
        dirty: false,
      });
      setNote(job ? `Generated and linked to “${job.title}”.` : "Generated a new résumé.");
    });

  // Find existing résumés best matching the JD.
  const find = () =>
    run("find", async () => {
      const r = await findResumesAction(jd);
      if (!r.ok) {
        setError(r.error ?? "find failed");
        return;
      }
      setFinds(r.results);
      if (r.results.length === 0) setNote("No saved résumés matched — try Generate.");
    });

  // Open a found résumé in the editor.
  const select = (id: string) =>
    run("select", async () => {
      const r = await loadResumeAction(id);
      if (!r.ok || !r.data || !r.resumeId) {
        setError(r.error ?? "could not load résumé");
        return;
      }
      const meta = r.meta ?? { company: "", domain: "", technologies: [], targetRole: "" };
      setSession({
        resumeId: r.resumeId,
        data: r.data,
        state: r.state,
        log: r.instructionsLog ?? [],
        label: r.label || defaultLabel(meta),
        meta,
        dirty: false,
      });
      setNote(null);
    });

  // Claude refine the open résumé in place (reselects from your bullet library).
  const refine = () =>
    run("refine", async () => {
      if (!session || !followup.trim()) return;
      const r = await composeResumeAction({
        jd, flavorId, targetRole,
        instructions: followup,
        resumeId: session.resumeId,
        current: session.state,
        priorInstructions: session.log,
      });
      if (!r.ok || !r.data) {
        setError(r.error ?? "refine failed");
        return;
      }
      setSession({
        ...session,
        data: r.data,
        state: r.state ?? session.state,
        log: r.instructionsLog ?? session.log,
        meta: r.meta ?? session.meta,
        usedClaude: r.usedClaude,
        dirty: false,
      });
      setFollowup("");
      setNote("Applied Claude edit.");
    });

  // Inline edit committed on the preview — local only until Save.
  const onEdit = (next: ResumeData) =>
    setSession((prev) => (prev ? { ...prev, data: next, dirty: true } : prev));

  const setLabel = (label: string) =>
    setSession((prev) => (prev ? { ...prev, label } : prev));

  // Save inline edits + label onto the open résumé.
  const save = () =>
    run("save", async () => {
      if (!session) return;
      const r = await saveResumeData(session.resumeId, session.data, session.label);
      if (!r.ok) {
        setError(r.error ?? "save failed");
        return;
      }
      await maybeLink(session.resumeId);
      setSession({ ...session, dirty: false });
      setNote(job ? `Saved and linked to “${job.title}”.` : "Saved.");
    });

  // Save a copy as a new library entry.
  const saveAsNew = () =>
    run("saveNew", async () => {
      if (!session) return;
      const r = await createResumeFromData({
        data: session.data,
        label: session.label?.trim() ? `${session.label} (copy)` : "Résumé",
        company: session.meta.company,
        domain: session.meta.domain,
        technologies: session.meta.technologies,
        targetRole: session.meta.targetRole,
        jd,
        usedClaude: session.usedClaude,
      });
      if (!r.ok || !r.resumeId) {
        setError(r.error ?? "save failed");
        return;
      }
      await maybeLink(r.resumeId);
      setSession({ ...session, resumeId: r.resumeId, label: `${session.label} (copy)`, dirty: false });
      setNote("Saved as a new résumé.");
    });

  return (
    <div className="composer">
      {job ? (
        <div className="panel" style={{ padding: "10px 14px", marginBottom: 4 }}>
          Composing for <b>{job.title}</b> — the saved résumé will be linked to this job.
        </div>
      ) : null}

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
            placeholder={"e.g. add Kubernetes and gRPC, remove the Acme role, emphasize backend"}
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

        <div className="row" style={{ gap: 10 }}>
          <button className="btn on" onClick={generate} disabled={pending || (!jd.trim() && !instructions.trim())}>
            {busy === "generate" ? "Composing with Claude…" : "✦ Generate résumé"}
          </button>
          <button className="btn" onClick={find} disabled={pending}>
            {busy === "find" ? "Searching…" : "🔎 Find résumé"}
          </button>
        </div>
        {error ? <p className="err">⚠ {error}</p> : null}
        {note ? <p className="muted" style={{ fontSize: 12 }}>{note}</p> : null}
      </div>

      {/* Find results: pick one to open it in the editor. */}
      {finds && finds.length > 0 ? (
        <div className="composer-out">
          <b>Best matches for this job</b>
          <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>Ranked by keyword/tech overlap with the JD. Pick one to edit.</p>
          <div className="reslib" style={{ marginTop: 10 }}>
            {finds.map((f) => (
              <div className="rescard" key={f.id}>
                <div className="rescard-head">
                  <button
                    className="rescard-title"
                    style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, textAlign: "left" }}
                    onClick={() => select(f.id)}
                    disabled={pending}
                  >
                    {f.label}
                  </button>
                  {f.domain ? <span className="pill">{f.domain}</span> : null}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {f.company ? <>{f.company} · </> : null}
                  {f.targetRole ? <>{f.targetRole} · </> : null}
                  match {f.score}
                </div>
                {f.matched.length ? (
                  <div className="tags" style={{ marginTop: 8 }}>
                    {f.matched.slice(0, 8).map((t) => <span className="pill t" key={t}>{t}</span>)}
                  </div>
                ) : null}
                <div className="rowacts" style={{ marginTop: 10 }}>
                  <button className="btn on" onClick={() => select(f.id)} disabled={pending}>
                    {busy === "select" ? "Opening…" : "Edit this →"}
                  </button>
                  <Link className="btn" href={`/resumes/${f.id}`}>Open page</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Editor surface: inline edit + Claude refine + save. */}
      {session ? (
        <div className={`composer-out ${pending ? "pending" : ""}`}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <label className="fld" style={{ flex: 1, minWidth: 220 }}>
              <span>Résumé name</span>
              <input className="status" value={session.label} onChange={(e) => setLabel(e.target.value)} placeholder="Résumé name" />
            </label>
            <div className="rowacts" style={{ alignSelf: "flex-end" }}>
              <span className="pill" style={{ marginRight: 6 }}>{session.usedClaude ? "Claude" : "deterministic"}</span>
              {session.dirty ? <span className="pill miss" style={{ marginRight: 6 }}>unsaved edits</span> : null}
              <button className="btn on" onClick={save} disabled={pending}>{busy === "save" ? "Saving…" : "Save"}</button>
              <button className="btn" onClick={saveAsNew} disabled={pending}>{busy === "saveNew" ? "Saving…" : "Save as new"}</button>
              <a className="btn" href={`/api/resume/${session.resumeId}/pdf`} target="_blank" rel="noreferrer">Download PDF</a>
              <Link className="btn" href={`/resumes/${session.resumeId}`}>Open →</Link>
            </div>
          </div>

          {session.meta.technologies?.length ? (
            <div className="tags" style={{ margin: "8px 0" }}>
              {session.meta.technologies.map((t) => <span className="pill t" key={t}>{t}</span>)}
            </div>
          ) : null}

          {/* Claude prompt box — refine the open résumé. */}
          <div className="followup">
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
            {session.log.length ? (
              <ol className="fu-log">
                {session.log.map((line, i) => <li key={i}>{line}</li>)}
              </ol>
            ) : null}
          </div>

          <p className="rp-hint">Click any text on the résumé to edit it inline. Changes are saved when you press <b>Save</b>.</p>
          <div className="rp-editing">
            <EditableResumePreview data={session.data} onChange={onEdit} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
