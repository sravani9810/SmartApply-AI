import type { ResumeData } from "@smartapply/shared";
import { db } from "../db/client";
import * as s from "../db/schema";
import { stripHtml } from "./tags";

/**
 * Deterministic "find the best existing résumé for this JD" ranker.
 *
 * Scores every saved résumé by weighted token overlap with the pasted job
 * description — its featured technologies count most, then skills, then bullet
 * text / summary. No Claude call: instant and free, matching the composer's
 * deterministic-fallback philosophy. The fuzzy/embedding half can come later.
 */

export interface FoundResume {
  id: string;
  label: string;
  company: string | null;
  domain: string | null;
  technologies: string[];
  targetRole: string | null;
  createdAt: string;
  /** Raw weighted overlap score (higher = better match). */
  score: number;
  /** JD tokens this résumé matched, for a quick "why" chip row. */
  matched: string[];
}

// Very small stopword list — enough to stop generic JD filler from dominating.
const STOP = new Set([
  "the", "and", "for", "with", "you", "your", "our", "are", "will", "have", "has",
  "this", "that", "from", "not", "but", "all", "can", "who", "may", "per", "was",
  "job", "role", "team", "work", "working", "years", "year", "experience", "including",
  "using", "ability", "strong", "must", "should", "would", "across", "into", "such",
  "them", "they", "their", "were", "when", "what", "which", "while", "about", "also",
  "new", "etc", "eg", "ie", "a", "an", "in", "on", "of", "to", "or", "as", "at", "is",
  "be", "we", "us", "it", "by", "up",
]);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9+.#]*/g) ?? []).filter(
    (t) => t.length >= 2 && !STOP.has(t),
  );
}

export function findResumesForJd(jd: string, limit = 8): FoundResume[] {
  const jdTokens = new Set(tokenize(jd));
  const rows = db.select().from(s.resumes).all();

  const scored: FoundResume[] = rows.map((r) => {
    const data = r.resumeData as ResumeData;
    const technologies = (r.technologies as string[] | null) ?? [];
    let score = 0;
    const matched = new Set<string>();

    const add = (text: string, weight: number) => {
      if (!text) return;
      for (const t of new Set(tokenize(text))) {
        if (jdTokens.has(t)) {
          score += weight;
          matched.add(t);
        }
      }
    };

    add(technologies.join(" "), 3);
    add((data.skills ?? []).join(" "), 2);
    const bulletText = [...(data.work_experience ?? []), ...(data.projects ?? [])]
      .flatMap((e) => e.description)
      .map(stripHtml)
      .join(" ");
    add(bulletText, 1);
    add((data.summary ?? []).map(stripHtml).join(" "), 1);
    add([r.company, r.domain, r.targetRole].filter(Boolean).join(" "), 2);

    return {
      id: r.id,
      label: r.label ?? "Résumé",
      company: r.company,
      domain: r.domain,
      technologies,
      targetRole: r.targetRole,
      createdAt: r.createdAt,
      score,
      matched: [...matched].slice(0, 12),
    };
  });

  // Best match first; when the JD is empty (all scores 0) fall back to newest.
  scored.sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt));
  return scored.slice(0, limit);
}
