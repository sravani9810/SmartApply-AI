import { sql } from "drizzle-orm";
import { db } from "./client";
import * as s from "./schema";

const count = (table: Parameters<typeof db.select>[0] extends never ? never : any) =>
  db.select({ n: sql<number>`count(*)` }).from(table).get()?.n ?? 0;

export function getStats() {
  return {
    experiences: count(s.experiences),
    bullets: count(s.bullets),
    tags: count(s.tags),
    skills: count(s.skills),
    flavors: count(s.flavors),
    jobs: count(s.jobs),
    applications: count(s.applications),
  };
}

export function getJobs(limit = 50) {
  return db
    .select({
      id: s.jobs.id,
      title: s.jobs.title,
      company: s.jobs.company,
      location: s.jobs.location,
      source: s.jobs.source,
      status: s.jobs.status,
      url: s.jobs.url,
    })
    .from(s.jobs)
    .orderBy(sql`${s.jobs.capturedAt} desc`)
    .limit(limit)
    .all();
}

export function getFlavors() {
  const flavors = db.select().from(s.flavors).all();
  return flavors.map((f) => ({
    ...f,
    bulletCount:
      db.select({ n: sql<number>`count(*)` }).from(s.flavorBullets)
        .where(sql`${s.flavorBullets.flavorId} = ${f.id}`).get()?.n ?? 0,
  }));
}
