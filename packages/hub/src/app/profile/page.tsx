import { getApplicantFields, getLearnedAnswerRows } from "../../db/queries";
import {
  saveApplicantFields, saveLearnedAnswer, removeLearnedAnswer, addLearnedAnswer,
} from "../../db/actions";
import { APPLICANT_FIELDS, APPLICANT_GROUPS } from "../../lib/applicantFields";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const fields = getApplicantFields();
  const rows = getLearnedAnswerRows();
  const q = ((await searchParams).q ?? "").trim();
  const needle = q.toLowerCase();
  const shown = needle
    ? rows.filter((r) => r.label.toLowerCase().includes(needle) || r.value.toLowerCase().includes(needle))
    : rows;

  return (
    <main className="wrap">
      <h1>Personal info</h1>
      <p className="sub">
        The single source of truth for application forms. The autofill extension loads these
        values from here — you don&apos;t enter them in the extension anymore.
      </p>

      <form action={saveApplicantFields}>
        {APPLICANT_GROUPS.map((g) => {
          const gf = APPLICANT_FIELDS.filter((f) => f.group === g.id);
          if (!gf.length) return null;
          return (
            <section key={g.id}>
              <h2>{g.label}</h2>
              <div className="pgrid">
                {gf.map((f) => (
                  <label className="fld" key={f.key}>
                    <span>{f.label}{f.hint ? <em className="muted"> · {f.hint}</em> : null}</span>
                    {f.type === "textarea" ? (
                      <textarea className="edit" name={f.key} defaultValue={fields[f.key] ?? ""} />
                    ) : (
                      <input
                        className="status" name={f.key} type={f.type ?? "text"}
                        defaultValue={fields[f.key] ?? ""}
                      />
                    )}
                  </label>
                ))}
              </div>
            </section>
          );
        })}
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn on" type="submit">Save personal info</button>
        </div>
      </form>

      <h2>Learned answers <span className="muted" style={{ fontWeight: 400 }}>({rows.length})</span></h2>
      <p className="sub" style={{ marginTop: -4 }}>
        Answers the extension recorded when it hit a field it couldn&apos;t match. These fill the
        same question automatically next time — so a wrong one repeats on every future
        application until you fix it here. Editing the question changes which field the answer
        matches. After changing anything, hit <b>Sync personal info from Hub</b> in the extension.
      </p>

      <form className="row" style={{ margin: "8px 0" }}>
        <input
          className="status" name="q" defaultValue={q} placeholder="Filter by question or answer…"
          style={{ flex: 1, minWidth: 220 }}
        />
        <button className="btn" type="submit">Filter</button>
        {q ? <a className="btn" href="/profile">Clear</a> : null}
      </form>

      {rows.length === 0 ? (
        <p className="empty">Nothing learned yet — the extension will add answers here as you fill forms.</p>
      ) : shown.length === 0 ? (
        <p className="empty">No learned answer matches “{q}”.</p>
      ) : (
        <div className="panel">
          <table>
            <thead>
              <tr><th style={{ width: "38%" }}>Question</th><th>Answer</th><th style={{ width: 150 }}>Updated</th></tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.label}>
                  <td>
                    <form action={saveLearnedAnswer} id={`f-${r.label}`}>
                      <input type="hidden" name="label" value={r.label} />
                      <input className="status" name="newLabel" defaultValue={r.label} style={{ width: "100%" }} />
                    </form>
                  </td>
                  <td>
                    <input
                      className="status" name="value" form={`f-${r.label}`}
                      defaultValue={r.value} style={{ width: "100%" }}
                    />
                  </td>
                  <td>
                    <div className="row">
                      <button className="btn on" type="submit" form={`f-${r.label}`}>Save</button>
                      <form action={removeLearnedAnswer}>
                        <input type="hidden" name="label" value={r.label} />
                        <button className="btn" type="submit">Forget</button>
                      </form>
                    </div>
                    <span className="muted" style={{ fontSize: 11 }}>{r.updatedAt.slice(0, 10)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 style={{ marginTop: 16 }}>Add an answer</h3>
      <form action={addLearnedAnswer} className="row">
        <input className="status" name="label" placeholder="Question as it appears on the form" style={{ flex: 1 }} required />
        <input className="status" name="value" placeholder="Answer to fill" style={{ flex: 1 }} required />
        <button className="btn on" type="submit">Add</button>
      </form>
    </main>
  );
}
