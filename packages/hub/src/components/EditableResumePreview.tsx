"use client";

import type { ResumeData, ResumeEntry, EducationEntry } from "@smartapply/shared";

/**
 * Inline-editable résumé preview, rendered inside the hub (no bounce to the
 * Part 4 builder). Click any text to edit it; edits commit on blur and are
 * pushed up via `onChange` so the parent owns the working ResumeData. The PDF
 * still renders through the builder's CV template from this same data.
 *
 * Controlled: `data` in, `onChange(next)` out. When `onChange` is omitted the
 * preview is read-only (drop-in for the old ResumePreview).
 */

type Path = (string | number)[];

function setIn<T>(obj: T, path: Path, value: string): T {
  const next: any = Array.isArray(obj) ? [...(obj as any)] : { ...obj };
  let node = next;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    const child = node[key];
    node[key] = Array.isArray(child) ? [...child] : { ...child };
    node = node[key];
  }
  node[path[path.length - 1]] = value;
  return next;
}

function Editable({
  value,
  path,
  plain,
  editable,
  commit,
  as: Tag = "span" as any,
  className,
}: {
  value: string;
  path: Path;
  plain?: boolean;
  editable: boolean;
  commit: (path: Path, value: string) => void;
  as?: any;
  className?: string;
}) {
  if (!editable) {
    return <Tag className={className} dangerouslySetInnerHTML={{ __html: value }} />;
  }
  return (
    <Tag
      className={`${className ? `${className} ` : ""}rp-edit`}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        const next = plain ? e.currentTarget.textContent || "" : e.currentTarget.innerHTML;
        if (next !== value) commit(path, next);
      }}
      dangerouslySetInnerHTML={{ __html: value }}
    />
  );
}

export function EditableResumePreview({
  data,
  onChange,
}: {
  data: ResumeData;
  onChange?: (next: ResumeData) => void;
}) {
  const editable = !!onChange;
  const commit = (path: Path, value: string) => onChange?.(setIn(data, path, value));

  const p = data.personal;
  const contacts = [
    p.phone,
    p.email,
    p.linkedin?.link && "LinkedIn",
    p.website?.link && "Website",
    p.github?.link && "GitHub",
  ].filter(Boolean);

  const EntryBlock = ({ e, base }: { e: ResumeEntry; base: Path }) => (
    <div className="rp-entry">
      <div className="rp-entry-head">
        <Editable className="rp-role" value={e.position} path={[...base, "position"]} plain editable={editable} commit={commit} />
        <Editable className="rp-co" value={e.company} path={[...base, "company"]} plain editable={editable} commit={commit} />
        <span className="rp-dates">{[e.start, e.end].filter(Boolean).join(" – ")}</span>
      </div>
      <ul className="rp-bullets">
        {e.description.map((d, i) => (
          <Editable key={i} as="li" value={d} path={[...base, "description", i]} editable={editable} commit={commit} />
        ))}
      </ul>
    </div>
  );

  const EduBlock = ({ e, base }: { e: EducationEntry; base: Path }) => (
    <div className="rp-entry">
      <div className="rp-entry-head">
        <Editable className="rp-role" value={e.degree} path={[...base, "degree"]} plain editable={editable} commit={commit} />
        <Editable className="rp-co" value={e.university} path={[...base, "university"]} plain editable={editable} commit={commit} />
        <span className="rp-dates">{[e.start, e.end].filter(Boolean).join(" – ")}</span>
      </div>
    </div>
  );

  return (
    <div className="rp">
      <Editable as="div" className="rp-name" value={p.name} path={["personal", "name"]} plain editable={editable} commit={commit} />
      <div className="rp-contacts">{contacts.join("  |  ")}</div>

      {data.summary?.length ? (
        <section>
          <h3 className="rp-h">Summary</h3>
          {data.summary.map((sPar, i) => (
            <Editable key={i} as="p" className="rp-p" value={sPar} path={["summary", i]} editable={editable} commit={commit} />
          ))}
        </section>
      ) : null}

      {data.skills?.length ? (
        <section>
          <h3 className="rp-h">Skills</h3>
          <ul className="rp-bullets">
            {data.skills.map((l, i) => (
              <Editable key={i} as="li" value={l} path={["skills", i]} editable={editable} commit={commit} />
            ))}
          </ul>
        </section>
      ) : null}

      {data.projects?.length ? (
        <section>
          <h3 className="rp-h">Personal Project</h3>
          {data.projects.map((e, i) => <EntryBlock key={i} e={e} base={["projects", i]} />)}
        </section>
      ) : null}

      {data.work_experience?.length ? (
        <section>
          <h3 className="rp-h">Experience</h3>
          {data.work_experience.map((e, i) => <EntryBlock key={i} e={e} base={["work_experience", i]} />)}
        </section>
      ) : null}

      {data.education?.length ? (
        <section>
          <h3 className="rp-h">Education</h3>
          {data.education.map((e, i) => <EduBlock key={i} e={e} base={["education", i]} />)}
        </section>
      ) : null}
    </div>
  );
}
