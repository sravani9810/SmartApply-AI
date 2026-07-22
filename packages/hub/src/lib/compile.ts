import { eq } from "drizzle-orm";
import type { ResumeData, ResumeEntry, PersonalData } from "@smartapply/shared";
import { db } from "../db/client";
import * as s from "../db/schema";

/** Ordered bullet selection per experience. */
export type Selection = Map<string, string[]>;

function bulletText(bulletId: string): string {
  const variants = db.select().from(s.bulletVariants)
    .where(eq(s.bulletVariants.bulletId, bulletId)).orderBy(s.bulletVariants.isPrimary).all();
  return variants.find((v) => v.isPrimary)?.text ?? variants[0]?.text ?? "";
}

/** Default selection for a flavor: its curated flavor_bullets, in order. */
export function flavorSelection(flavorId: string): Selection {
  const rows = db.select().from(s.flavorBullets)
    .where(eq(s.flavorBullets.flavorId, flavorId)).orderBy(s.flavorBullets.ord).all();
  const sel: Selection = new Map();
  for (const r of rows) {
    (sel.get(r.experienceId) ?? sel.set(r.experienceId, []).get(r.experienceId)!).push(r.bulletId);
  }
  return sel;
}

function entriesFor(kind: "work" | "project", selection: Selection): ResumeEntry[] {
  const experiences = db.select().from(s.experiences)
    .where(eq(s.experiences.kind, kind)).orderBy(s.experiences.ord).all();
  return experiences
    .map((e): ResumeEntry => ({
      company: e.company,
      position: e.title,
      url: e.url,
      location: e.location,
      start: e.start,
      end: e.end,
      description: (selection.get(e.id) ?? []).map(bulletText).filter(Boolean),
    }))
    .filter((entry) => entry.description.length > 0); // drop experiences with nothing selected
}

/** Chunk the skills master list into pipe-joined bullet lines for the template. */
function skillLines(perLine = 15): string[] {
  const names = db.select().from(s.skills).orderBy(s.skills.ord).all().map((x) => x.name);
  const lines: string[] = [];
  for (let i = 0; i < names.length; i += perLine) lines.push(names.slice(i, i + perLine).join(" | "));
  return lines;
}

/**
 * Compile a `ResumeData` from the library for a flavor, optionally overriding
 * which bullets each experience uses (e.g. Claude's tailored selection). This
 * is the seam: it renders through the Part 4 CV template unchanged.
 */
export function compile(flavorId: string, selection?: Selection): ResumeData {
  const sel = selection ?? flavorSelection(flavorId);
  const personal = (db.select().from(s.profile).where(eq(s.profile.id, "me")).get()?.data
    ?? { name: "", email: "", website: { readable: "", link: "" },
         github: { readable: "", link: "" }, linkedin: { readable: "", link: "" },
         skillset: [] }) as PersonalData;

  return {
    personal,
    summary: db.select().from(s.summarySnippets).orderBy(s.summarySnippets.ord).all().map((x) => x.text),
    skills: skillLines(),
    projects: entriesFor("project", sel),
    work_experience: entriesFor("work", sel),
    education: db.select().from(s.education).orderBy(s.education.ord).all().map((e) => ({
      degree: e.degree, university: e.university, url: e.url, location: e.location,
      start: e.start, end: e.end, description: e.description ?? [],
    })),
  };
}
