import Link from "next/link";
import { getFlavors, getJob } from "../../db/queries";
import { Composer } from "../../components/Composer";

export const dynamic = "force-dynamic";

export default async function BuildPage({ searchParams }: { searchParams: Promise<{ jobId?: string }> }) {
  const { jobId } = await searchParams;
  const flavors = getFlavors().map((f) => ({ id: f.id, name: f.name }));

  // When opened from a job, prefill the JD and link the saved résumé to it.
  const job = jobId ? getJob(jobId) : null;
  const jobCtx = job ? { id: job.id, title: `${job.title}${job.company ? ` · ${job.company}` : ""}` } : undefined;
  const initial = job?.description ? { jd: job.description } : undefined;

  return (
    <main className="wrap">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ marginBottom: 0 }}>Résumé composer</h1>
        <Link href="/resumes" className="backlink">résumé library →</Link>
      </div>
      <p className="sub">
        Paste a job description, then <b>Generate</b> a fresh tailored résumé or <b>Find</b> a matching one from your
        library. Edit it inline, ask Claude for changes, rename, and save — all here.
      </p>
      <Composer flavors={flavors} initial={initial} job={jobCtx} />
    </main>
  );
}
