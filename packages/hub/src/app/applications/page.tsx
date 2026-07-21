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
              <tr><th>Job</th><th>Company</th><th>Status</th><th>Applied</th></tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id}>
                  <td>{a.jobTitle ?? "—"}</td>
                  <td>{a.jobCompany ?? "—"}</td>
                  <td><span className="pill">{a.status}</span></td>
                  <td className="muted">{a.appliedAt ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
