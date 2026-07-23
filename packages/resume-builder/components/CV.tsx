import React, { createContext, useContext } from 'react';
import { ResumeData, SkillSetCategory, WorkExperience } from '../types/cv_types';

// Theme colors kept as inline styles (not Tailwind classes) so they render
// identically in the live editor and in the puppeteer / PDFShift PDF, which
// doesn't load the app's global stylesheet.
const NAVY = '#2f5496';
const RULE = '#8aa1c9';
const MUTED = '#6b7280';

// ---------------------------------------------------------------------------
// Inline editing
//
// CV1 can render in a read-only mode (the default — used for the PDF export and
// static previews) or an "editable" mode where text is edited in-place directly
// on the rendered résumé. Editable mode is opt-in via the `editable` prop and a
// `onFieldEdit(path, value)` callback; the path locates the edited field inside
// ResumeData (e.g. ['work_experience', 0, 'description', 2]) so the parent can
// immutably update its state. When `editable` is false nothing below changes,
// keeping the PDF output byte-for-byte identical.
// ---------------------------------------------------------------------------
export type EditPath = (string | number)[];
type EditContextValue = {
  editable: boolean;
  onFieldEdit?: (path: EditPath, value: string) => void;
};
const EditContext = createContext<EditContextValue>({ editable: false });

/**
 * A text node that becomes contentEditable in editable mode and reports its new
 * value (by `path`) on blur. `plain` fields report textContent (no markup);
 * rich fields report innerHTML so inline <b> (Ctrl/Cmd+B) survives.
 */
const Editable = ({
  path,
  value,
  plain,
  as: Tag = 'span' as any,
  className,
  style,
}: {
  path: EditPath;
  value: string;
  plain?: boolean;
  as?: any;
  className?: string;
  style?: React.CSSProperties;
}): JSX.Element => {
  const { editable, onFieldEdit } = useContext(EditContext);
  if (!editable) {
    return <Tag className={className} style={style} dangerouslySetInnerHTML={{ __html: value }} />;
  }
  const editClass = `${className ? `${className} ` : ''}editable-field`;
  return (
    <Tag
      className={editClass}
      style={style}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        const next = plain ? e.currentTarget.textContent || '' : e.currentTarget.innerHTML;
        if (next !== value) onFieldEdit?.(path, next);
      }}
      dangerouslySetInnerHTML={{ __html: value }}
    />
  );
};

/** Small inline icons (13px) — self-contained so contact-row sizing is stable in the PDF. */
const Icon = ({ children }: { children: React.ReactNode }): JSX.Element => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width="13"
    height="13"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flex: 'none', position: 'relative', top: '2px' }}
  >
    {children}
  </svg>
);
const LinkedInIcon = () => (
  <Icon>
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect x="2" y="9" width="4" height="12" />
    <circle cx="4" cy="4" r="2" />
  </Icon>
);
const PhoneIcon = () => (
  <Icon>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </Icon>
);
const GlobeIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </Icon>
);
const MailIcon = () => (
  <Icon>
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </Icon>
);
const GitHubIcon = () => (
  <Icon>
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
  </Icon>
);

/** A section title followed by a rule that fills the remaining width. */
const SectionHeading = ({ title }: { title: string }): JSX.Element => (
  <div className="flex items-center gap-3" style={{ marginTop: '18px', marginBottom: '6px' }}>
    <h2 className="font-bold" style={{ color: NAVY, fontSize: '15px', whiteSpace: 'nowrap' }}>
      {title}
    </h2>
    <span style={{ flex: 1, borderBottom: `1px solid ${RULE}` }} />
  </div>
);

/** Blue-dot bullet list; each item may contain inline <b> markup and is editable. */
const Bullets = ({ items, basePath }: { items: string[]; basePath?: EditPath }): JSX.Element => (
  <ul style={{ marginTop: '4px' }} className="space-y-1">
    {items.map((item, i) => (
      <li key={i} className="flex" style={{ lineHeight: 1.35 }}>
        <span style={{ color: NAVY, marginRight: '8px', flex: 'none' }}>•</span>
        <Editable
          path={basePath ? [...basePath, i] : []}
          value={item}
          style={{ flex: 1 }}
        />
      </li>
    ))}
  </ul>
);

/**
 * One experience / project / education entry header: role at the left, the org
 * name centered (as a link, or an editable span in edit mode), and location +
 * dates at the right. `basePath` points at the entry object so role/org/location
 * become editable.
 */
const EntryHeader = (props: {
  role: string;
  org: string;
  url?: string;
  location?: string;
  start?: string;
  end?: string;
  basePath?: EditPath;
  roleKey?: string;
  orgKey?: string;
}): JSX.Element => {
  const { role, org, url, location, start, end, basePath, roleKey = 'position', orgKey = 'company' } = props;
  const { editable } = useContext(EditContext);
  const dates = [start, end].filter(Boolean).join(' - ');
  const orgStyle: React.CSSProperties = {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    color: NAVY,
    whiteSpace: 'nowrap',
  };
  return (
    <div className="relative flex justify-between items-baseline" style={{ marginTop: '10px' }}>
      <Editable
        path={basePath ? [...basePath, roleKey] : []}
        value={role}
        plain
        className="font-bold"
        style={{ fontSize: '13.5px' }}
      />
      {editable ? (
        <Editable path={basePath ? [...basePath, orgKey] : []} value={org} plain className="font-semibold" style={orgStyle} />
      ) : url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold underline" style={orgStyle}>
          {org}
        </a>
      ) : (
        <span className="font-semibold" style={orgStyle}>
          {org}
        </span>
      )}
      <span style={{ whiteSpace: 'nowrap' }}>
        {location ? (
          <Editable
            path={basePath ? [...basePath, 'location'] : []}
            value={location}
            plain
            className="italic"
            style={{ color: MUTED, marginRight: '12px' }}
          />
        ) : null}
        {dates ? <span className="font-bold">{dates}</span> : null}
      </span>
    </div>
  );
};

const Entry = (exp: WorkExperience & { basePath?: EditPath }): JSX.Element => (
  <div style={{ marginBottom: '6px' }}>
    <EntryHeader
      role={exp.position}
      org={exp.company}
      url={exp.url}
      location={exp.location}
      start={exp.start}
      end={exp.end}
      basePath={exp.basePath}
    />
    <Bullets items={exp.description} basePath={exp.basePath ? [...exp.basePath, 'description'] : undefined} />
  </div>
);

/** Fallback when `data.skills` is not provided: render categorized skillset lines. */
const SkillSetComp = ({ skillset }: { skillset: SkillSetCategory[] }): JSX.Element => (
  <>
    {skillset.map((cat, i) => {
      const skills = [...cat.skills].sort((a, b) => Number(b.level) - Number(a.level));
      return (
        <li key={i} className="flex" style={{ lineHeight: 1.35 }}>
          <span style={{ color: NAVY, marginRight: '8px', flex: 'none' }}>•</span>
          <span style={{ flex: 1 }}>
            <span className="font-semibold">{cat.label}: </span>
            {skills.map((s) => s.skill).join(' | ')}
          </span>
        </li>
      );
    })}
  </>
);

export const CV1 = (
  data: ResumeData & { editable?: boolean; onFieldEdit?: (path: EditPath, value: string) => void },
): JSX.Element => {
  const p = data.personal;
  const contactItems: JSX.Element[] = [];
  if (p.linkedin?.link)
    contactItems.push(
      <a href={p.linkedin.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline" style={{ color: NAVY }}>
        <LinkedInIcon /> LinkedIn
      </a>,
    );
  if (p.phone)
    contactItems.push(
      <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1">
        <PhoneIcon /> {p.phone}
      </a>,
    );
  if (p.website?.link)
    contactItems.push(
      <a href={p.website.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline" style={{ color: NAVY }}>
        <GlobeIcon /> Website
      </a>,
    );
  if (p.email)
    contactItems.push(
      <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1">
        <MailIcon /> {p.email}
      </a>,
    );
  if (p.github?.link)
    contactItems.push(
      <a href={p.github.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline" style={{ color: NAVY }}>
        <GitHubIcon /> GitHub
      </a>,
    );

  return (
    <EditContext.Provider value={{ editable: !!data.editable, onFieldEdit: data.onFieldEdit }}>
      <div id="resume" style={{ fontFamily: 'Lato, Helvetica, Arial, sans-serif', fontSize: '12px', color: '#1f2937', lineHeight: 1.35 }}>
        {/* Header */}
        <div id="intro">
          <Editable
            as="h1"
            path={['personal', 'name']}
            value={p.name}
            plain
            className="text-center"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontVariant: 'small-caps', fontSize: '30px', letterSpacing: '1px', margin: 0 }}
          />
          <div className="flex flex-wrap justify-center items-center" style={{ gap: '8px', marginTop: '4px' }}>
            {contactItems.map((item, i) => (
              <span key={i} className="inline-flex items-center" style={{ gap: '8px' }}>
                {item}
                {i < contactItems.length - 1 ? <span style={{ color: MUTED }}>|</span> : null}
              </span>
            ))}
          </div>
        </div>

        {/* Summary */}
        {data.summary?.length ? (
          <div id="summary">
            <SectionHeading title="Summary" />
            {data.summary.map((para, i) => (
              <Editable
                key={i}
                as="p"
                path={['summary', i]}
                value={para}
                style={{ marginTop: i === 0 ? '4px' : '8px', lineHeight: 1.4 }}
              />
            ))}
          </div>
        ) : null}

        {/* Skills */}
        {data.skills?.length || p.skillset?.length ? (
          <div id="skills">
            <SectionHeading title="Skills" />
            <ul style={{ marginTop: '4px' }} className="space-y-1">
              {data.skills?.length ? (
                data.skills.map((line, i) => (
                  <li key={i} className="flex" style={{ lineHeight: 1.35 }}>
                    <span style={{ color: NAVY, marginRight: '8px', flex: 'none' }}>•</span>
                    <Editable path={['skills', i]} value={line} style={{ flex: 1 }} />
                  </li>
                ))
              ) : (
                <SkillSetComp skillset={p.skillset} />
              )}
            </ul>
          </div>
        ) : null}

        {/* Personal Project */}
        {data.projects?.length ? (
          <div id="projects">
            <SectionHeading title="Personal Project" />
            {data.projects.map((proj, i) => (
              <Entry key={i} {...proj} basePath={['projects', i]} />
            ))}
          </div>
        ) : null}

        {/* Experience */}
        {data.work_experience?.length ? (
          <div id="experience">
            <SectionHeading title="Experience" />
            {data.work_experience.map((exp, i) => (
              <Entry key={i} {...exp} basePath={['work_experience', i]} />
            ))}
          </div>
        ) : null}

        {/* Education */}
        {data.education?.length ? (
          <div id="education">
            <SectionHeading title="Education" />
            {data.education.map((ed, i) => (
              <div key={i} style={{ marginBottom: '6px' }}>
                <EntryHeader
                  role={ed.degree}
                  org={ed.university}
                  url={ed.url}
                  location={ed.location}
                  start={ed.start}
                  end={ed.end}
                  basePath={['education', i]}
                  roleKey="degree"
                  orgKey="university"
                />
                {ed.description?.length ? <Bullets items={ed.description} basePath={['education', i, 'description']} /> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </EditContext.Provider>
  );
};
