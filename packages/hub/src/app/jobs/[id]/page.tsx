import Link from "next/link";
import { notFound } from "next/navigation";
import { getJob, getJobTagNames, getFlavorFit, getFlavors, getTailoringForJob } from "../../../db/queries";
import { analyzeJob, setJobStatus, tailorJob } from "../../../db/actions";
import { JOB_STATUSES } from "../../../lib/status";

export const dynamic = "force-dynamic";

const STATUSES = JOB_STATUSES;

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) notFound();

  const jobTags = getJobTagNames(id);
  const fit = getFlavorFit(jobTags);
  const flavors = getFlavors();
  const tailoring = getTailoringForJob(id);
  const match = tailoring?.match;

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

      <h2>Tailor résumé</h2>
      <p className="sub" style={{ marginTop: -6 }}>
        Claude selects &amp; orders your approved bullets for this JD (on your subscription;
        falls back to tag ranking if not signed in). It never fabricates experience.
      </p>
      <form action={tailorJob.bind(null, id)} className="row">
        <select className="status" name="flavorId" defaultValue={tailoring?.resumeId ? undefined : flavors[0]?.id}>
          {flavors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <button className="btn" type="submit">Tailor →</button>
      </form>

      {match ? (
        <div className="panel" style={{ marginTop: 14, padding: "14px 18px" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <span className="fitscore">{Math.round((match.fitScore ?? 0) * 100)}%</span>
              <span className="muted" style={{ marginLeft: 8 }}>fit</span>
              <span className="pill" style={{ marginLeft: 12 }}>
                {tailoring?.usedClaude ? "Claude" : "tag-based fallback"}
              </span>
            </div>
            {tailoring?.resumeId ? (
              <Link href={`/resumes/${tailoring.resumeId}`}>view tailored résumé →</Link>
            ) : null}
          </div>
          {match.summary ? <p style={{ lineHeight: 1.5 }}>{match.summary}</p> : null}
          <div className="meta">
            {match.matchedSkills?.map((t) => <span className="pill t" key={"m" + t}>{t}</span>)}
          </div>
          {match.missingSkills?.length ? (
            <>
              <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>Missing / not evidenced:</div>
              <div className="meta">
                {match.missingSkills.map((t) => <span className="pill miss" key={"x" + t}>{t}</span>)}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {tailoring?.resumeId ? (
        <>
          <h2>Apply</h2>
          <div className="panel" style={{ padding: "14px 18px" }}>
            <ol className="steps">
              <li>
                {job.url
                  ? <a href={job.url} target="_blank" rel="noreferrer">Open the posting →</a>
                  : "Open the posting"} and let the autofill extension fill the form.
              </li>
              <li>
                <a href={`/api/resume/${tailoring.resumeId}/pdf`} target="_blank" rel="noreferrer">
                  Download the tailored PDF
                </a> and attach it (résumé upload can&apos;t be automated).
              </li>
              <li>Review everything, then submit the application yourself.</li>
              <li>
                Mark it applied — set status above, or click <b>Mark Applied</b> in the extension
                (it syncs back here automatically).
              </li>
            </ol>
          </div>
        </>
      ) : null}

      <h2>Description</h2>
      {job.description ? (
        <div className="jd">{job.description}</div>
      ) : (
        <p className="empty" style={{ padding: 0 }}>No description captured for this job.</p>
      )}
    </main>
  );
}
