import Link from "next/link";
import { notFound } from "next/navigation";
import { getResume } from "../../../db/queries";
import { deriveState } from "../../../lib/compose";
import { duplicateResume } from "../../../db/actions";
import { ResumeRefiner } from "../../../components/ResumeRefiner";
import { DeleteResumeButton } from "../../../components/DeleteResumeButton";

export const dynamic = "force-dynamic";

export default async function ResumePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resume = getResume(id);
  if (!resume) notFound();

  const counts =
    (resume.data.work_experience?.reduce((n, e) => n + e.description.length, 0) ?? 0) +
    (resume.data.projects?.reduce((n, e) => n + e.description.length, 0) ?? 0);

  const techs = (resume.technologies ?? []) as string[];
  const initialLog = (resume.instructions ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const initialState = deriveState(resume.data);
  const forkThis = duplicateResume.bind(null, id);

  return (
    <main className="wrap">
      <Link href="/resumes" className="backlink">← résumé library</Link>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", marginTop: 10 }}>
        <h1 style={{ marginBottom: 0 }}>{resume.label || "Tailored résumé"}</h1>
        <div className="rowacts">
          <form action={forkThis}>
            <button className="btn" type="submit">＋ Create another from this</button>
          </form>
          <a className="btn" href={`/api/resume/${id}/pdf`} target="_blank" rel="noreferrer">Download PDF</a>
          <DeleteResumeButton id={id} label={resume.label} redirectTo="/resumes" />
        </div>
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

      <ResumeRefiner
        resumeId={id}
        initialData={resume.data}
        initialState={initialState}
        initialLog={initialLog}
        initialLabel={resume.label || "Tailored résumé"}
        jd={resume.jd ?? undefined}
        flavorId={resume.flavorId ?? undefined}
        targetRole={resume.targetRole ?? undefined}
      />
    </main>
  );
}
