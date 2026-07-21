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

  return (
    <main className="wrap">
      <Link href="/applications" className="backlink">← applications</Link>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", marginTop: 10 }}>
        <h1 style={{ marginBottom: 0 }}>Tailored résumé</h1>
        <a className="btn" href={`/api/resume/${id}/pdf`} target="_blank" rel="noreferrer">Download PDF</a>
      </div>
      <p className="sub">{counts} bullets selected. PDF renders through Part 4&apos;s CV template.</p>
      <ResumePreview data={resume.data} />
    </main>
  );
}
