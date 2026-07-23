import fs from 'fs/promises';
import path from 'path';
import { ResumeData } from '../types/cv_types';

/**
 * File-backed résumé library. Each saved résumé is one JSON file under
 * `data/saved/<id>.json` with the shape:
 *   { title: string, updatedAt: ISO-string, data: ResumeData }
 *
 * The directory is tracked in git so saved résumés are versionable/portable.
 * These helpers run server-side only (used by pages/api/resumes/*).
 */

const SAVED_DIR = path.join(process.cwd(), 'data', 'saved');
// Ids map 1:1 to filenames; restrict the charset to keep filesystem access safe
// (no path traversal, no surprises across OSes).
const ID_RE = /^[a-z0-9-]+$/;

export interface SavedResumeMeta {
  id: string;
  title: string;
  updatedAt: string;
}
export interface SavedResume extends SavedResumeMeta {
  data: ResumeData;
}

function slugify(input: string): string {
  const base = (input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'untitled';
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(SAVED_DIR, { recursive: true });
}

function fileFor(id: string): string {
  if (!ID_RE.test(id)) throw new Error(`Invalid resume id: ${id}`);
  return path.join(SAVED_DIR, `${id}.json`);
}

export async function listResumes(): Promise<SavedResumeMeta[]> {
  await ensureDir();
  const files = (await fs.readdir(SAVED_DIR)).filter((f) => f.endsWith('.json'));
  const out: SavedResumeMeta[] = [];
  for (const f of files) {
    try {
      const raw = JSON.parse(await fs.readFile(path.join(SAVED_DIR, f), 'utf8'));
      const id = f.replace(/\.json$/, '');
      out.push({ id, title: raw.title || id, updatedAt: raw.updatedAt || '' });
    } catch {
      // skip unreadable / malformed files rather than failing the whole list
    }
  }
  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return out;
}

export async function getResume(id: string): Promise<SavedResume | null> {
  try {
    const raw = JSON.parse(await fs.readFile(fileFor(id), 'utf8'));
    return { id, title: raw.title || id, updatedAt: raw.updatedAt || '', data: raw.data };
  } catch {
    return null;
  }
}

async function uniqueId(base: string): Promise<string> {
  await ensureDir();
  let id = base;
  let n = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await fs.stat(fileFor(id)).then(() => true).catch(() => false)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}

/** Create a brand-new saved résumé (the "Save as new" path). */
export async function createResume(title: string, data: ResumeData): Promise<SavedResume> {
  await ensureDir();
  const finalTitle = (title || data?.personal?.name || 'Untitled').trim();
  const id = await uniqueId(slugify(finalTitle));
  const updatedAt = new Date().toISOString();
  await fs.writeFile(fileFor(id), `${JSON.stringify({ title: finalTitle, updatedAt, data }, null, 2)}\n`);
  return { id, title: finalTitle, updatedAt, data };
}

/** Overwrite an existing saved résumé in place (the "Save" path). */
export async function saveResume(id: string, title: string | undefined, data: ResumeData): Promise<SavedResume> {
  await ensureDir();
  const existing = await getResume(id);
  const finalTitle = (title ?? existing?.title ?? id).trim() || id;
  const updatedAt = new Date().toISOString();
  await fs.writeFile(fileFor(id), `${JSON.stringify({ title: finalTitle, updatedAt, data }, null, 2)}\n`);
  return { id, title: finalTitle, updatedAt, data };
}

export async function deleteResume(id: string): Promise<void> {
  await fs.unlink(fileFor(id)).catch(() => {});
}
