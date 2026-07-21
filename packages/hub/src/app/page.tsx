import { getStats, getJobs, getFlavors } from "../db/queries";

// Read the DB on every request (local single-user app).
export const dynamic = "force-dynamic";

export default function Dashboard() {
  const stats = getStats();
  const jobs = getJobs();
  const flavors = getFlavors();

  const statCards: Array<[string, number]> = [
    ["Jobs", stats.jobs],
    ["Applications", stats.applications],
    ["Experiences", stats.experiences],
    ["Bullets", stats.bullets],
    ["Skills", stats.skills],
    ["Tags", stats.tags],
    ["Flavors", stats.flavors],
  ];

  return (
    <main className="wrap">
      <h1>SmartApply Hub</h1>
      <p className="sub">Local job-search hub — Part 0. Library seeded from your résumé; jobs from Part 1.</p>

      <div className="stats">
        {statCards.map(([label, n]) => (
          <div className="stat" key={label}>
            <div className="n">{n}</div>
            <div className="l">{label}</div>
          </div>
        ))}
      </div>

      <h2>Résumé flavors</h2>
      {flavors.length === 0 ? (
        <p className="empty">No flavors yet — run <code>npm run db:seed</code>.</p>
      ) : (
        <div className="flavors">
          {flavors.map((f) => (
            <div className="flavor" key={f.id}>
              <div className="name">{f.name}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                {f.bulletCount} bullets selected
              </div>
              <div className="tags">
                {(f.tags ?? []).map((t) => (
                  <span className="pill" key={t}>{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <h2>Jobs ({jobs.length})</h2>
      <div className="panel">
        {jobs.length === 0 ? (
          <p className="empty">No jobs yet — run the Part 1 pipeline, then <code>npm run db:seed</code>.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Title</th><th>Company</th><th>Location</th><th>Source</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td>{j.title}</td>
                  <td>{j.company}</td>
                  <td className="muted">{j.location ?? "—"}</td>
                  <td><span className="pill">{j.source || "—"}</span></td>
                  <td><span className="pill">{j.status}</span></td>
                  <td>{j.url ? <a href={j.url} target="_blank" rel="noreferrer">open ↗</a> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
