import { getLibrary, getSkills, getSummarySnippets, getFlavors } from "../../db/queries";
import { editBulletText, toggleBulletApproved } from "../../db/actions";

export const dynamic = "force-dynamic";

export default function LibraryPage() {
  const experiences = getLibrary();
  const skills = getSkills();
  const summary = getSummarySnippets();
  const flavors = getFlavors();

  return (
    <main className="wrap">
      <h1>Résumé library</h1>
      <p className="sub">
        Your curated content. Bullets are reused across flavors — edit the phrasing,
        toggle whether a bullet is eligible to be emitted, and see which flavors use it.
      </p>

      <h2>Experiences &amp; bullets</h2>
      {experiences.map((e) => (
        <div className="exp" key={e.id}>
          <div className="exp-head">
            <div>
              <span className="role">{e.title}</span>
              {" — "}
              <span className="co">{e.company}</span>
              <span className="kindtag">{e.kind}</span>
            </div>
            <span className="dates">{[e.start, e.end].filter(Boolean).join(" – ")}</span>
          </div>

          {e.bullets.map((b) => (
            <div className={`bullet${b.approved ? "" : " dim"}`} key={b.id}>
              <div className="txt" dangerouslySetInnerHTML={{ __html: b.text }} />
              <form action={editBulletText.bind(null, b.id)} className="row">
                <textarea className="edit" name="text" defaultValue={b.text} />
                <button className="btn" type="submit">Save</button>
              </form>
              <div className="meta">
                {b.tags.map((t) => <span className="pill t" key={t}>{t}</span>)}
                <form action={toggleBulletApproved.bind(null, b.id)}>
                  <button className={`btn ${b.approved ? "on" : ""}`} type="submit">
                    {b.approved ? "✓ approved" : "excluded"}
                  </button>
                </form>
                <div className="flavors">
                  {b.flavors.map((f) => <span className="pill f" key={f}>{f}</span>)}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}

      <h2>Skills ({skills.length})</h2>
      <div className="panel" style={{ padding: "12px 16px" }}>
        {skills.map((sk) => <span className="pill" key={sk.id} style={{ margin: "3px" }}>{sk.name}</span>)}
      </div>

      <h2>Summary snippets</h2>
      <div className="panel" style={{ padding: 4 }}>
        {summary.map((sn) => (
          <p key={sn.id} style={{ padding: "10px 14px", margin: 0, borderBottom: "1px solid var(--border)", lineHeight: 1.5 }}>
            {sn.text}
          </p>
        ))}
      </div>

      <h2>Flavors</h2>
      <div className="flavors">
        {flavors.map((f) => (
          <div className="flavor" key={f.id}>
            <div className="name">{f.name}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{f.bulletCount} bullets selected</div>
            <div className="tags">{(f.tags ?? []).map((t) => <span className="pill" key={t}>{t}</span>)}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
