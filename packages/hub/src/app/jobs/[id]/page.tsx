import Link from "next/link";
import { notFound } from "next/navigation";
import { getJob, getJobTagNames, getFlavorFit } from "../../../db/queries";
import { analyzeJob, setJobStatus } from "../../../db/actions";

export const dynamic = "force-dynamic";

const STATUSES = ["new", "matched", "applied", "skipped", "error"];

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) notFound();

  const jobTags = getJobTagNames(id);
  const fit = getFlavorFit(jobTags);

  return (
    <main className="wrap">
      <Link href="/" className="backlink">← all jobs</Link>
      <h1 style={{ marginTop: 10 }}>{job.title}</h1>
      <p className="sub">
        {job.company}{job.location ? ` · ${job.location}` : ""}{job.source ? ` · ${job.source}` : ""}
        {job.url ? <> · <a href={job.url} target="_blank" rel="noreferrer">open posting ↗</a></> : null}
      </p>

      <div className="row" style={{ marginTop: 14 }}>
        <form action={setJobStatus.bind(null, id)} className="row">
          <select className="status" name="status" defaultValue={job.status}>
            {STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
          </select>
          <button className="btn" type="submit">Set status</button>
        </form>
        <form action={analyzeJob.bind(null, id)}>
          <button className="btn" type="submit">Analyze description → tags</button>
        </form>
      </div>

      <h2>Tags {jobTags.length ? `(${jobTags.length})` : ""}</h2>
      {jobTags.length === 0 ? (
        <p className="empty" style={{ padding: 0 }}>None yet — click <b>Analyze</b> to extract tags from the description.</p>
      ) : (
        <div>{jobTags.map((t) => <span className="pill t" key={t} style={{ margin: 3 }}>{t}</span>)}</div>
      )}

      <h2>Flavor fit</h2>
      <p className="sub" style={{ marginTop: -6 }}>Tag overlap with each flavor (a preview of Phase-4 matching).</p>
      <div className="fit">
        {fit.map((f) => (
          <div className="f" key={f.name}>{f.name} <b>{f.overlap}</b></div>
        ))}
      </div>

      <h2>Description</h2>
      {job.description ? (
        <div className="jd">{job.description}</div>
      ) : (
        <p className="empty" style={{ padding: 0 }}>No description captured for this job.</p>
      )}
    </main>
  );
}
