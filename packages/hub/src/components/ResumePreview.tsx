import type { ResumeData, ResumeEntry, EducationEntry } from "@smartapply/shared";

function Entry({ e }: { e: ResumeEntry }) {
  return (
    <div className="rp-entry">
      <div className="rp-entry-head">
        <span className="rp-role">{e.position}</span>
        <span className="rp-co">{e.company}</span>
        <span className="rp-dates">{[e.start, e.end].filter(Boolean).join(" – ")}</span>
      </div>
      <ul className="rp-bullets">
        {e.description.map((d, i) => <li key={i} dangerouslySetInnerHTML={{ __html: d }} />)}
      </ul>
    </div>
  );
}

function Edu({ e }: { e: EducationEntry }) {
  return (
    <div className="rp-entry">
      <div className="rp-entry-head">
        <span className="rp-role">{e.degree}</span>
        <span className="rp-co">{e.university}</span>
        <span className="rp-dates">{[e.start, e.end].filter(Boolean).join(" – ")}</span>
      </div>
    </div>
  );
}

/** Lightweight in-hub preview of a compiled ResumeData (the PDF renders in Part 4's CV template). */
export function ResumePreview({ data }: { data: ResumeData }) {
  const p = data.personal;
  const contacts = [p.phone, p.email, p.linkedin?.link && "LinkedIn", p.website?.link && "Website", p.github?.link && "GitHub"]
    .filter(Boolean);
  return (
    <div className="rp">
      <div className="rp-name">{p.name}</div>
      <div className="rp-contacts">{contacts.join("  |  ")}</div>

      {data.skills?.length ? (
        <section><h3 className="rp-h">Skills</h3>
          <ul className="rp-bullets">{data.skills.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </section>
      ) : null}

      {data.summary?.length ? (
        <section><h3 className="rp-h">Summary</h3>
          {data.summary.map((s, i) => <p key={i} className="rp-p">{s}</p>)}
        </section>
      ) : null}

      {data.projects?.length ? (
        <section><h3 className="rp-h">Personal Project</h3>
          {data.projects.map((e, i) => <Entry key={i} e={e} />)}
        </section>
      ) : null}

      {data.work_experience?.length ? (
        <section><h3 className="rp-h">Experience</h3>
          {data.work_experience.map((e, i) => <Entry key={i} e={e} />)}
        </section>
      ) : null}

      {data.education?.length ? (
        <section><h3 className="rp-h">Education</h3>
          {data.education.map((e, i) => <Edu key={i} e={e} />)}
        </section>
      ) : null}
    </div>
  );
}
