"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchJobsAction, type SearchResult } from "../db/actions";

/**
 * Dashboard search box: scrape jobs for keywords + location via the Part 1
 * pipeline and import them into the hub, then refresh the table.
 */
export function SearchJobs() {
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("");
  const [days, setDays] = useState("7");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = () =>
    startTransition(async () => {
      const r = await searchJobsAction({
        keywords,
        location,
        postedWithinDays: Number(days) || 7,
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
        <button className="btn on" onClick={run} disabled={pending || !keywords.trim()}>
          {pending ? "Scraping…" : "🔍 Search & import"}
        </button>
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
          Runs the Part 1 scraper for this search (Indeed when enabled) and imports the results.
        </p>
      )}
    </div>
  );
}
