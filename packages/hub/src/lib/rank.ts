import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import * as s from "../db/schema";

export interface RankedBullet {
  bulletId: string;
  text: string;
  tags: string[];
  score: number;
}
export interface RankedExperience {
  experienceId: string;
  company: string;
  title: string;
  kind: string;
  bullets: RankedBullet[]; // sorted best-first
}

/** Load the tag ontology as child→parents (by name) for transitive expansion. */
function parentsByChild(): Map<string, string[]> {
  const name = new Map(db.select().from(s.tags).all().map((t) => [t.id, t.name]));
  const map = new Map<string, string[]>();
  for (const e of db.select().from(s.tagEdges).all()) {
    const child = name.get(e.childTagId);
    const parent = name.get(e.parentTagId);
    if (!child || !parent) continue;
    (map.get(child) ?? map.set(child, []).get(child)!).push(parent);
  }
  return map;
}

/** Expand a set of tag names to include their ontology parents (up to 2 hops). */
export function expandTags(names: Iterable<string>, parents = parentsByChild()): Set<string> {
  const out = new Set<string>(names);
  for (let hop = 0; hop < 2; hop++) {
    for (const n of [...out]) for (const p of parents.get(n) ?? []) out.add(p);
  }
  return out;
}

function jobTagNames(jobId: string): string[] {
  const rows = db.select().from(s.jobTags).where(eq(s.jobTags.jobId, jobId)).all();
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.tagId);
  return db.select().from(s.tags).where(inArray(s.tags.id, ids)).all().map((t) => t.name);
}

/**
 * Rank every approved bullet against a job's tags via ontology-expanded overlap.
 * This is the explicit, explainable half of matching that seeds the candidate
 * set handed to Claude (the fuzzy vector half arrives with sqlite-vec later).
 */
export function rankBullets(jobId: string): RankedExperience[] {
  const parents = parentsByChild();
  const jobTagSet = expandTags(jobTagNames(jobId), parents);
  const tagName = new Map(db.select().from(s.tags).all().map((t) => [t.id, t.name]));
  const experiences = db.select().from(s.experiences)
    .orderBy(s.experiences.kind, s.experiences.ord).all();

  return experiences.map((e) => {
    const bulletRows = db.select().from(s.bullets)
      .where(eq(s.bullets.experienceId, e.id)).orderBy(s.bullets.ord).all()
      .filter((b) => b.approved);

    const bullets: RankedBullet[] = bulletRows.map((b) => {
      const text = db.select().from(s.bulletVariants)
        .where(eq(s.bulletVariants.bulletId, b.id)).orderBy(s.bulletVariants.isPrimary).all()
        .find((v) => v.isPrimary)?.text
        ?? db.select().from(s.bulletVariants).where(eq(s.bulletVariants.bulletId, b.id)).get()?.text
        ?? "";
      const tags = db.select().from(s.bulletTags).where(eq(s.bulletTags.bulletId, b.id)).all()
        .map((r) => tagName.get(r.tagId) ?? "").filter(Boolean);
      const expanded = expandTags(tags, parents);
      let score = 0;
      for (const t of expanded) if (jobTagSet.has(t)) score++;
      return { bulletId: b.id, text, tags, score };
    }).sort((a, b) => b.score - a.score);

    return { experienceId: e.id, company: e.company, title: e.title, kind: e.kind, bullets };
  });
}
