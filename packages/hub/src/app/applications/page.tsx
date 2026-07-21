import Link from "next/link";
import { getApplications } from "../../db/queries";

export const dynamic = "force-dynamic";

export default function ApplicationsPage() {
  const apps = getApplications();
  return (
    <main className="wrap">
      <h1>Applications</h1>
      <p className="sub">Which résumé went to which job. Populated from Phase 6 (semi-auto apply).</p>
      <div className="panel">
        {apps.length === 0 ? (
          <p className="empty">
            No applications yet. Once tailoring (Phase 4) and the apply loop (Phase 6) are wired,
            each submission records the job, the résumé version, and the exact bullets sent.
          </p>
        ) : (
          <table>
            <thead>
              <tr><th>Job</th><th>Company</th><th>Fit</th><th>Tailored by</th><th>Status</th><th>Résumé</th></tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id}>
                  <td><Link href={`/jobs/${a.jobId}`}>{a.jobTitle ?? "—"}</Link></td>
                  <td>{a.jobCompany ?? "—"}</td>
                  <td>{a.match ? `${Math.round((a.match.fitScore ?? 0) * 100)}%` : "—"}</td>
                  <td><span className="pill">{a.usedClaude ? "Claude" : a.match ? "tag-based" : "—"}</span></td>
                  <td><span className="pill">{a.status}</span></td>
                  <td>{a.resumeId ? <Link href={`/resumes/${a.resumeId}`}>view →</Link> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
