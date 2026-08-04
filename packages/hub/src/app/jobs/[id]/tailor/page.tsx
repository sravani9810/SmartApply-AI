import Link from "next/link";
import type { ResumeData } from "@smartapply/shared";
import { getJob, getSetting } from "../../../../db/queries";
import {
  adaptResumeForJob, acceptTailoredResume,
  savePromptTemplateAction, resetPromptTemplateAction,
} from "../../../../db/actions";
import { getBaseResume, baseResumeStats, BASE_RESUME_KEY } from "../../../../lib/baseResume";
import { getPromptTemplate, isPromptCustomised } from "../../../../lib/promptTemplate";
import { diffResumes, diffTotals, integrityWarnings, type LineDiff } from "../../../../lib/resumeDiff";

export const dynamic = "force-dynamic";

interface Draft {
  ok: boolean;
  error?: string;
  before: ResumeData;
  after?: ResumeData;
  prompt: string;
  at?: string;
}

const strip = (s: string) => s.replace(/<[^>]*>/g, "");

function Words({ line, side }: { line: LineDiff; side: "before" | "after" }) {
  if (!line.words) return <>{strip((side === "before" ? line.before : line.after) ?? "")}</>;
  return (
    <>
      {line.words
        .filter((w) => w.t === "same" || w.t === (side === "before" ? "del" : "add"))
        .map((w, i) =>
          w.t === "same" ? (
            <span key={i}>{strip(w.text)}</span>
          ) : (
            <mark
              key={i}
              style={{
                background: side === "before" ? "#4a1c1c" : "#17331f",
                color: side === "before" ? "#f0a3a3" : "#8fe0aa",
                padding: "0 2px", borderRadius: 3,
              }}
            >
              {strip(w.text)}
            </mark>
          ),
        )}
    </>
  );
}

const ROW_BG: Record<string, string> = {
  added: "#12261a", removed: "#2a1414", changed: "transparent", moved: "transparent", same: "transparent",
};

export default async function TailorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) return <main className="wrap"><h1>Job not found</h1></main>;

  const draft = getSetting<Draft>(`tailorDraft:${id}`);
  const base = getBaseResume();
  const stats = baseResumeStats(base);
  const template = getPromptTemplate();
  const customised = isPromptCustomised();

  const sections = draft?.after ? diffResumes(draft.before, draft.after) : [];
  const totals = diffTotals(sections);
  const warnings = draft?.after ? integrityWarnings(draft.before, draft.after) : [];

  return (
    <main className="wrap">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ marginBottom: 0 }}>Write résumé</h1>
        <Link href={`/jobs/${id}`} className="backlink">← back to job</Link>
      </div>
      <p className="sub">
        {job.title}{job.company ? ` · ${job.company}` : ""}
      </p>
      <p className="sub">
        Base: <b>{BASE_RESUME_KEY}</b> — {stats.roles} roles, {stats.bullets} bullets,{" "}
        {stats.skills} skill lines. Claude edits <i>this</i> document to match the job; the
        format and every section stay as they are.
      </p>

      <div className="row">
        <form action={adaptResumeForJob.bind(null, id)}>
          <button className="btn on" type="submit">
            {draft ? "Re-run against the job" : "Adapt master résumé →"}
          </button>
        </form>
        {draft?.after ? (
          <form action={acceptTailoredResume.bind(null, id)}>
            <button className="btn" type="submit">Accept &amp; save to library</button>
          </form>
        ) : null}
        {draft?.at ? <span className="muted" style={{ fontSize: 12 }}>run {draft.at.slice(0, 16).replace("T", " ")}</span> : null}
      </div>

      <details style={{ marginTop: 14 }}>
        <summary>
          Prompt template {customised ? <span className="muted">(customised)</span> : <span className="muted">(default)</span>}
        </summary>
        <p className="sub" style={{ marginTop: 8 }}>
          Sent to Claude with <code>{"{{jobTitle}}"}</code>, <code>{"{{company}}"}</code>,{" "}
          <code>{"{{jd}}"}</code> and <code>{"{{resume}}"}</code> substituted. Edit it to change
          how aggressively the résumé is rewritten.
        </p>
        <form action={savePromptTemplateAction}>
          <input type="hidden" name="back" value={`/jobs/${id}/tailor`} />
          <textarea
            className="edit" name="template" defaultValue={template}
            style={{ width: "100%", minHeight: 320, fontFamily: "var(--mono, monospace)", fontSize: 12 }}
          />
          <div className="row">
            <button className="btn on" type="submit">Save template</button>
          </div>
        </form>
        <form action={resetPromptTemplateAction}>
          <input type="hidden" name="back" value={`/jobs/${id}/tailor`} />
          <button className="btn" type="submit">Reset to default</button>
        </form>
      </details>

      {draft?.prompt ? (
        <details style={{ marginTop: 10 }}>
          <summary>Exact prompt sent for this run ({draft.prompt.length.toLocaleString()} chars)</summary>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, maxHeight: 380, overflow: "auto" }}>
            {draft.prompt}
          </pre>
        </details>
      ) : null}

      {draft && !draft.ok ? (
        <p className="empty" style={{ color: "#f0a3a3" }}>Adapting failed: {draft.error}</p>
      ) : null}

      {warnings.length ? (
        <div className="panel" style={{ marginTop: 14, borderColor: "#5e2a2a" }}>
          <div style={{ padding: 12 }}>
            <b style={{ color: "#f0a3a3" }}>Check these before accepting</b>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {warnings.map((w, i) => <li key={i} style={{ fontSize: 13 }}>{w}</li>)}
            </ul>
          </div>
        </div>
      ) : null}

      {draft?.after ? (
        <>
          <h2 style={{ marginTop: 18 }}>
            Changes{" "}
            <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>
              {totals.changed} reworded · {totals.added} added · {totals.removed} removed ·{" "}
              {totals.moved} moved · {totals.same} untouched
            </span>
          </h2>

          {sections.map((sec) => (
            <div key={sec.title} style={{ marginTop: 14 }}>
              <h3 style={{ marginBottom: 6 }}>
                {sec.title}{" "}
                <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>
                  +{sec.counts.added} −{sec.counts.removed} ~{sec.counts.changed}
                </span>
              </h3>
              <div className="panel">
                <table style={{ tableLayout: "fixed", width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ width: "50%" }}>Master</th>
                      <th style={{ width: "50%" }}>Tailored for this job</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sec.lines.map((l, i) => (
                      <tr key={i} style={{ background: ROW_BG[l.status] }}>
                        <td style={{ verticalAlign: "top", fontSize: 13, lineHeight: 1.5 }}>
                          {l.before ? <Words line={l} side="before" /> : <span className="muted">—</span>}
                        </td>
                        <td style={{ verticalAlign: "top", fontSize: 13, lineHeight: 1.5 }}>
                          {l.after ? <Words line={l} side="after" /> : <span className="muted">—</span>}
                          {l.status === "moved" ? (
                            <span className="muted" style={{ fontSize: 11 }}> (moved)</span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      ) : draft?.ok === false ? null : (
        <p className="empty">
          Nothing adapted yet — run it above to see a side-by-side diff against the master.
        </p>
      )}
    </main>
  );
}
