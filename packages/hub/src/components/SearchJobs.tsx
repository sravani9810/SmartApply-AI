"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchJobsAction, type SearchResult } from "../db/actions";

/**
 * Dashboard search box: scrape jobs for keywords + location via the Part 1
 * pipeline and import them into the hub, then refresh the table.
 */
const PLATFORMS = [
  { key: "indeed", label: "Indeed" },
  { key: "linkedin", label: "LinkedIn" },
] as const;

export function SearchJobs() {
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("");
  const [days, setDays] = useState("7");
  const [sources, setSources] = useState<Set<string>>(new Set(PLATFORMS.map((p) => p.key)));
  const [result, setResult] = useState<SearchResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const toggleSource = (key: string) =>
    setSources((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  const run = () =>
    startTransition(async () => {
      const r = await searchJobsAction({
        keywords,
        location,
        postedWithinDays: Number(days) || 7,
        sources: [...sources],
      });
      setResult(r);
      if (r.ok) router.refresh();
    });

  return (
    <div className="searchbox">
      <div className="searchrow">
        <input
          className="status" style={{ flex: 2 }} value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") run(); }}
          placeholder="Keywords, e.g. backend engineer, typescript"
          disabled={pending}
        />
        <input
          className="status" style={{ flex: 1 }} value={location}
          onChange={(e) => setLocation(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") run(); }}
          placeholder="Location (e.g. Remote)"
          disabled={pending}
        />
        <input
          className="status" style={{ width: 74 }} value={days} type="number" min={1}
          onChange={(e) => setDays(e.target.value)}
          title="Posted within N days" disabled={pending}
        />
        <button className="btn on" onClick={run} disabled={pending || !keywords.trim() || sources.size === 0}>
          {pending ? "Scraping…" : "🔍 Search & import"}
        </button>
      </div>
      <div className="platforms">
        <span className="muted">Platforms:</span>
        {PLATFORMS.map((p) => (
          <label key={p.key} className="plat">
            <input
              type="checkbox" checked={sources.has(p.key)}
              onChange={() => toggleSource(p.key)} disabled={pending}
            />
            {p.label}
          </label>
        ))}
      </div>
      {result ? (
        result.ok ? (
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Imported {result.written} of {result.received} scraped posting(s).
          </p>
        ) : (
          <p className="err" style={{ marginTop: 6 }}>⚠ {result.error}</p>
        )
      ) : (
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Scrapes the selected platform(s) for this search and imports the results.
          Each platform needs its one-time login (<code>npm run login:indeed</code> / <code>login:linkedin</code>).
        </p>
      )}
    </div>
  );
}
