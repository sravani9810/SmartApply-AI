import Link from "next/link";
import { getResumes, getResumeDomains } from "../../db/queries";
import { DeleteResumeButton } from "../../components/DeleteResumeButton";

export const dynamic = "force-dynamic";

export default async function ResumeLibrary({ searchParams }: { searchParams: Promise<{ domain?: string }> }) {
  const { domain } = await searchParams;
  const resumes = getResumes(domain);
  const domains = getResumeDomains();
  const total = Object.values(domains).reduce((a, b) => a + b, 0);
  const href = (d?: string) => (d ? `/resumes?domain=${encodeURIComponent(d)}` : "/resumes");

  return (
    <main className="wrap">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ marginBottom: 0 }}>Résumé library</h1>
        <Link href="/build" className="btn on">✦ New résumé</Link>
      </div>
      <p className="sub">Every résumé you&apos;ve composed, with the company, domain, and main technologies it targets.</p>

      <div className="filterbar">
        <Link href={href()} className={`chip${!domain ? " on" : ""}`}>All <b>{total}</b></Link>
        {Object.entries(domains).sort().map(([d, n]) => (
          <Link key={d} href={href(d)} className={`chip${domain === d ? " on" : ""}`}>{d} <b>{n}</b></Link>
        ))}
      </div>

      {resumes.length === 0 ? (
        <p className="empty">No résumés yet — compose one in the <Link href="/build">résumé composer</Link>.</p>
      ) : (
        <div className="reslib">
          {resumes.map((r) => (
            <div className="rescard" key={r.id}>
              <div className="rescard-head">
                <Link href={`/resumes/${r.id}`} className="rescard-title">{r.label || "Résumé"}</Link>
                {r.domain ? <span className="pill">{r.domain}</span> : null}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {r.company ? <>{r.company} · </> : null}
                {r.targetRole ? <>{r.targetRole} · </> : null}
                {new Date(r.createdAt).toLocaleDateString()}
                {r.usedClaude ? " · Claude" : ""}
              </div>
              {r.technologies?.length ? (
                <div className="tags" style={{ marginTop: 8 }}>
                  {r.technologies.slice(0, 6).map((t) => <span className="pill t" key={t}>{t}</span>)}
                </div>
              ) : null}
              <div className="rowacts" style={{ marginTop: 10 }}>
                <a className="btn" href={`/api/resume/${r.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
                <Link className="btn" href={`/resumes/${r.id}`}>Open →</Link>
                <DeleteResumeButton id={r.id} label={r.label} />
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
