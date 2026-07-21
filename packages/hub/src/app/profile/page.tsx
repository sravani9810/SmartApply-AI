import { getApplicantFields, getLearnedAnswers } from "../../db/queries";
import { saveApplicantFields } from "../../db/actions";
import { APPLICANT_FIELDS, APPLICANT_GROUPS } from "../../lib/applicantFields";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const fields = getApplicantFields();
  const learned = getLearnedAnswers();
  const learnedEntries = Object.entries(learned);

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

      <h2>Learned answers</h2>
      <p className="sub" style={{ marginTop: -4 }}>
        Answers the extension recorded when it hit a field it couldn&apos;t match. These fill
        the same question automatically next time.
      </p>
      {learnedEntries.length === 0 ? (
        <p className="empty">Nothing learned yet — the extension will add answers here as you fill forms.</p>
      ) : (
        <div className="panel">
          <table>
            <thead><tr><th>Question</th><th>Answer</th></tr></thead>
            <tbody>
              {learnedEntries.map(([label, value]) => (
                <tr key={label}><td className="muted">{label}</td><td>{value}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
