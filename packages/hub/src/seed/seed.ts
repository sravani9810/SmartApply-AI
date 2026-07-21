import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import ExcelJS from "exceljs";
import type { ResumeData, ResumeEntry } from "@smartapply/shared";
import { db } from "../db/client";
import * as s from "../db/schema";
import { ALL_TAGS, TAG_ONTOLOGY, autoTag, stripHtml } from "../lib/tags";
// The current default résumé is the seed source of truth for the library.
import { data as resume } from "../../../resume-builder/data/cv_data";

const here = dirname(fileURLToPath(import.meta.url));
const id = () => randomUUID();

function clearLibrary() {
  // Order respects FKs (children first). Jobs/applications are preserved.
  for (const t of [
    s.applicationBullets, s.flavorBullets, s.bulletTags, s.bulletVariants,
    s.bullets, s.skillTags, s.skills, s.summarySnippets, s.education,
    s.tagEdges, s.tags, s.flavors, s.experiences,
  ]) {
    db.delete(t).run();
  }
}

function seedTags(): Map<string, string> {
  const byName = new Map<string, string>();
  for (const t of ALL_TAGS) {
    const tid = id();
    byName.set(t.name, tid);
    db.insert(s.tags).values({ id: tid, name: t.name, category: t.category }).run();
  }
  for (const [parent, child] of TAG_ONTOLOGY) {
    const p = byName.get(parent);
    const c = byName.get(child);
    if (p && c) db.insert(s.tagEdges).values({ parentTagId: p, childTagId: c, kind: "is_a" }).run();
  }
  return byName;
}

function seedExperience(entry: ResumeEntry, kind: "work" | "project", ord: number, tagIds: Map<string, string>) {
  const eid = id();
  db.insert(s.experiences).values({
    id: eid, company: entry.company, title: entry.position, location: entry.location,
    start: entry.start, end: entry.end, url: entry.url, kind, ord,
  }).run();

  entry.description.forEach((text, i) => {
    const bid = id();
    db.insert(s.bullets).values({ id: bid, experienceId: eid, approved: true, ord: i }).run();
    db.insert(s.bulletVariants).values({ id: id(), bulletId: bid, text, isPrimary: true }).run();
    for (const tagName of autoTag(text)) {
      const tid = tagIds.get(tagName);
      if (tid) db.insert(s.bulletTags).values({ bulletId: bid, tagId: tid }).run();
    }
  });
  return eid;
}

function seedFlavors(tagIds: Map<string, string>) {
  const flavorDefs: Array<{ name: string; key: string; tags: string[] }> = [
    { name: "Frontend", key: "frontend", tags: ["frontend", "react", "angular", "typescript", "redux", "nextjs"] },
    { name: "Backend", key: "backend", tags: ["backend", "java", "python", "node", "sql", "kafka", "distributed-systems"] },
    { name: "SDE (generalist)", key: "sde", tags: ["frontend", "backend", "fullstack", "distributed-systems", "testing", "leadership"] },
    { name: "Cloud", key: "cloud", tags: ["cloud", "aws", "azure", "terraform", "kubernetes", "cicd", "oci"] },
  ];

  // Auto-select each flavor's bullets by tag overlap with the flavor's tags.
  const allExperiences = db.select().from(s.experiences).all();
  for (const f of flavorDefs) {
    const fid = id();
    db.insert(s.flavors).values({ id: fid, name: f.name, tags: f.tags, pageBudget: 2 }).run();
    const flavorTagIds = new Set(f.tags.map((t) => tagIds.get(t)).filter(Boolean) as string[]);

    for (const exp of allExperiences) {
      const expBullets = db.select().from(s.bullets).where(eq(s.bullets.experienceId, exp.id)).all();
      let ord = 0;
      for (const b of expBullets) {
        const bTagRows = db.select().from(s.bulletTags).where(eq(s.bulletTags.bulletId, b.id)).all();
        const overlap = bTagRows.some((r) => flavorTagIds.has(r.tagId));
        if (overlap) {
          db.insert(s.flavorBullets).values({ flavorId: fid, experienceId: exp.id, bulletId: b.id, ord: ord++ }).run();
        }
      }
    }
  }
}

function seedSkills(data: ResumeData, tagIds: Map<string, string>) {
  const lines = data.skills ?? [];
  let ord = 0;
  for (const line of lines) {
    for (const raw of stripHtml(line).split("|")) {
      const name = raw.trim();
      if (!name) continue;
      const sid = id();
      db.insert(s.skills).values({ id: sid, name, ord: ord++ }).run();
      for (const tagName of autoTag(name)) {
        const tid = tagIds.get(tagName);
        if (tid) db.insert(s.skillTags).values({ skillId: sid, tagId: tid }).run();
      }
    }
  }
}

async function importJobs() {
  // The Part 1 workbook. Prefer the package copy; fall back to the repo /data.
  const candidates = [
    join(here, "..", "..", "..", "job-search", "data", "jobs.xlsx"),
    join(here, "..", "..", "..", "..", "data", "jobs.xlsx"),
  ];
  const path = candidates.find(existsSync);
  if (!path) {
    console.log("[seed] no jobs.xlsx found — skipping job import");
    return 0;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.worksheets[0];
  if (!ws) return 0;

  // Map header text -> column index from row 1.
  const header = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => header.set(String(cell.value ?? "").trim(), col));
  const cell = (row: ExcelJS.Row, name: string): string => {
    const col = header.get(name);
    if (!col) return "";
    const v = row.getCell(col).value;
    return v == null ? "" : typeof v === "object" && "text" in v ? String((v as { text: unknown }).text) : String(v);
  };

  let count = 0;
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const jobId = cell(row, "ID");
    if (!jobId) continue;
    db.insert(s.jobs).values({
      id: jobId,
      title: cell(row, "Title") || "(untitled)",
      company: cell(row, "Company") || "(unknown)",
      location: cell(row, "Location") || null,
      source: cell(row, "Source"),
      url: cell(row, "Link"),
      datePosted: cell(row, "Date Posted") || null,
      endDate: cell(row, "End Date") || null,
      recruiterName: cell(row, "Recruiter") || null,
      recruiterEmail: cell(row, "Recruiter Email") || null,
      recruiterPhone: cell(row, "Recruiter Phone") || null,
      status: cell(row, "Status") || "new",
    }).onConflictDoNothing().run();
    count++;
  }
  return count;
}

async function main() {
  console.log("[seed] clearing library…");
  clearLibrary();

  const tagIds = seedTags();
  console.log(`[seed] tags: ${tagIds.size}`);

  (resume.projects ?? []).forEach((p, i) => seedExperience(p, "project", i, tagIds));
  resume.work_experience.forEach((w, i) => seedExperience(w, "work", i, tagIds));
  const expCount = db.select().from(s.experiences).all().length;
  const bulletCount = db.select().from(s.bullets).all().length;
  console.log(`[seed] experiences: ${expCount}, bullets: ${bulletCount}`);

  seedSkills(resume, tagIds);
  (resume.summary ?? []).forEach((text, i) =>
    db.insert(s.summarySnippets).values({ id: id(), text, ord: i }).run());
  resume.education.forEach((e, i) =>
    db.insert(s.education).values({
      id: id(), degree: e.degree, university: e.university, location: e.location,
      start: e.start, end: e.end, url: e.url, description: e.description, ord: i,
    }).run());

  seedFlavors(tagIds);
  const flavorCount = db.select().from(s.flavors).all().length;
  const fbCount = db.select().from(s.flavorBullets).all().length;
  console.log(`[seed] flavors: ${flavorCount} (${fbCount} bullet selections)`);

  const jobCount = await importJobs();
  console.log(`[seed] imported ${jobCount} job(s)`);
  console.log("[seed] done.");
}

import { eq } from "drizzle-orm";
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
