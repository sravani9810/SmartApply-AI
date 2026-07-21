import Link from "next/link";
import { notFound } from "next/navigation";
import { getResume } from "../../../db/queries";
import { ResumePreview } from "../../../components/ResumePreview";

export const dynamic = "force-dynamic";

export default async function ResumePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resume = getResume(id);
  if (!resume) notFound();

  const counts =
    (resume.data.work_experience?.reduce((n, e) => n + e.description.length, 0) ?? 0) +
    (resume.data.projects?.reduce((n, e) => n + e.description.length, 0) ?? 0);

  const techs = (resume.technologies ?? []) as string[];

  return (
    <main className="wrap">
      <Link href="/resumes" className="backlink">← résumé library</Link>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", marginTop: 10 }}>
        <h1 style={{ marginBottom: 0 }}>{resume.label || "Tailored résumé"}</h1>
        <a className="btn" href={`/api/resume/${id}/pdf`} target="_blank" rel="noreferrer">Download PDF</a>
      </div>
      <p className="sub">
        {[resume.company, resume.domain, resume.targetRole].filter(Boolean).join(" · ")}
        {resume.company || resume.domain || resume.targetRole ? " · " : ""}
        {counts} bullets · {resume.usedClaude ? "Claude" : "deterministic"}
      </p>
      {techs.length ? (
        <div className="tags" style={{ marginBottom: 8 }}>
          {techs.map((t) => <span className="pill t" key={t}>{t}</span>)}
        </div>
      ) : null}
      {resume.instructions ? (
        <p className="muted" style={{ fontSize: 13 }}><b>Instructions:</b> {resume.instructions}</p>
      ) : null}
      <ResumePreview data={resume.data} />
    </main>
  );
}
