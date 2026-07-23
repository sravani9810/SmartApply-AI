"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { bulkSetStatus, setStatusValue } from "../db/actions";

export interface JobRow {
  id: string;
  title: string;
  company: string;
  location: string | null;
  source: string;
  status: string;
  url: string;
  datePosted: string | null;
  capturedAt: string;
}

/** Relative time (e.g. "2 mins ago", "1 day ago"); "—" when missing/unparseable. */
function relTime(v: string | null): string {
  if (!v) return "—";
  const t = new Date(v).getTime();
  if (Number.isNaN(t)) return v;
  const secs = Math.round((Date.now() - t) / 1000);
  if (secs < 0) return "just now";
  const units: [number, string][] = [
    [60, "sec"], [60, "min"], [24, "hour"], [7, "day"], [4.34524, "week"],
    [12, "month"], [Number.POSITIVE_INFINITY, "year"],
  ];
  let n = secs;
  for (const [size, label] of units) {
    if (n < size) {
      const r = Math.floor(n);
      if (label === "sec" && r < 5) return "just now";
      return `${r} ${label}${r === 1 ? "" : "s"} ago`;
    }
    n /= size;
  }
  return v;
}

/** Full local date-time for the hover tooltip. */
function fmtFull(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
}

export function JobsTable({ jobs }: { jobs: JobRow[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const allChecked = jobs.length > 0 && jobs.every((j) => sel.has(j.id));
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(jobs.map((j) => j.id)));

  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      await fn();
      setSel(new Set());
      router.refresh();
    });
  const bulk = (status: string) => run(() => bulkSetStatus([...sel], status));
  const row = (id: string, status: string) => run(() => setStatusValue(id, status));

  return (
    <div className={pending ? "pending" : ""}>
      {sel.size > 0 ? (
        <div className="bulkbar">
          <span>{sel.size} selected</span>
          <button className="btn on" onClick={() => bulk("applied")} disabled={pending}>✓ Mark applied</button>
          <button className="btn danger" onClick={() => bulk("not-applying")} disabled={pending}>✕ Not applying</button>
          <button className="btn" onClick={() => setSel(new Set())} disabled={pending}>clear</button>
        </div>
      ) : null}
      <table>
        <thead>
          <tr>
            <th style={{ width: 28 }}>
              <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all" />
            </th>
            <th>Title</th><th>Company</th><th>Location</th><th>Source</th>
            <th>Posted</th><th>Added</th><th>Status</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} className={sel.has(j.id) ? "selrow" : ""}>
              <td>
                <input type="checkbox" checked={sel.has(j.id)} onChange={() => toggle(j.id)} aria-label={`Select ${j.title}`} />
              </td>
              <td><Link href={`/jobs/${j.id}`}>{j.title}</Link></td>
              <td>{j.company}</td>
              <td className="muted">{j.location ?? "—"}</td>
              <td><span className="pill">{j.source || "—"}</span></td>
              <td className="muted" title={fmtFull(j.datePosted)} suppressHydrationWarning>{relTime(j.datePosted)}</td>
              <td className="muted" title={fmtFull(j.capturedAt)} suppressHydrationWarning>{relTime(j.capturedAt)}</td>
              <td><span className={`pill st-${j.status}`}>{j.status}</span></td>
              <td>
                <div className="rowacts">
                  <button className="iconbtn apply" title="Mark applied" onClick={() => row(j.id, "applied")} disabled={pending}>✓</button>
                  <button className="iconbtn nope" title="Not applying" onClick={() => row(j.id, "not-applying")} disabled={pending}>✕</button>
                  {j.url ? <a href={j.url} target="_blank" rel="noreferrer" className="muted">open ↗</a> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
