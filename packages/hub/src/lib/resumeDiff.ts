import type { ResumeData, ResumeEntry } from "@smartapply/shared";

/**
 * Structural diff between the master résumé and a tailored one, plus a
 * word-level diff of each changed line.
 *
 * The point is reviewability: the prompt lets Claude add JD keywords to the
 * skills section, which is the one edit that can claim something the candidate
 * never claimed. That is only safe if every change is visible before the PDF
 * is generated, so nothing here summarises — it reports each line.
 */

export type WordOp = { t: "same" | "add" | "del"; text: string };
export type LineStatus = "same" | "changed" | "added" | "removed" | "moved";

export interface LineDiff {
  status: LineStatus;
  before?: string;
  after?: string;
  /** Word-level ops, only for `changed` lines. */
  words?: WordOp[];
  /** Original index, when a bullet kept its text but moved position. */
  fromIndex?: number;
  toIndex?: number;
}

export interface SectionDiff {
  title: string;
  lines: LineDiff[];
  counts: { added: number; removed: number; changed: number; moved: number; same: number };
}

const words = (s: string) => (s || "").split(/(\s+)/).filter((w) => w.length > 0);
const normalise = (s: string) => (s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Word-level diff via longest common subsequence. Résumé bullets are a few
 * dozen words, so the quadratic table is irrelevant here and an exact LCS reads
 * far better than a heuristic when the edit is a handful of swapped terms.
 */
export function diffWords(before: string, after: string): WordOp[] {
  const a = words(before);
  const b = words(after);
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: WordOp[] = [];
  const push = (t: WordOp["t"], text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.t === t) last.text += text;
    else ops.push({ t, text });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { push("same", a[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push("del", a[i]); i++; }
    else { push("add", b[j]); j++; }
  }
  while (i < n) push("del", a[i++]);
  while (j < m) push("add", b[j++]);
  return ops;
}

/**
 * Pair up two lists of lines. Identical text pairs first (so a bullet that only
 * moved is reported as moved, not as a delete plus an add); the remainder is
 * matched greedily by word overlap so a reworded bullet lines up with its
 * original instead of looking like an unrelated pair.
 */
function pairLines(before: string[], after: string[]): LineDiff[] {
  const usedB = new Set<number>();
  const usedA = new Set<number>();
  const out: LineDiff[] = [];

  before.forEach((b, bi) => {
    const ai = after.findIndex((a, idx) => !usedA.has(idx) && normalise(a) === normalise(b));
    if (ai !== -1) {
      usedB.add(bi); usedA.add(ai);
      out.push({
        status: bi === ai ? "same" : "moved",
        before: b, after: after[ai], fromIndex: bi, toIndex: ai,
      });
    }
  });

  const score = (x: string, y: string) => {
    const xs = new Set(normalise(x).split(" ").filter((w) => w.length > 3));
    const ys = new Set(normalise(y).split(" ").filter((w) => w.length > 3));
    if (!xs.size || !ys.size) return 0;
    let hit = 0;
    for (const w of xs) if (ys.has(w)) hit++;
    return hit / Math.max(xs.size, ys.size);
  };

  before.forEach((b, bi) => {
    if (usedB.has(bi)) return;
    let best = -1, bestScore = 0.25; // below this they aren't the same bullet
    after.forEach((a, ai) => {
      if (usedA.has(ai)) return;
      const sc = score(b, a);
      if (sc > bestScore) { bestScore = sc; best = ai; }
    });
    if (best !== -1) {
      usedB.add(bi); usedA.add(best);
      out.push({
        status: "changed", before: b, after: after[best],
        words: diffWords(b, after[best]), fromIndex: bi, toIndex: best,
      });
    } else {
      usedB.add(bi);
      out.push({ status: "removed", before: b, fromIndex: bi });
    }
  });

  after.forEach((a, ai) => {
    if (!usedA.has(ai)) out.push({ status: "added", after: a, toIndex: ai });
  });

  return out.sort((x, y) => (x.toIndex ?? x.fromIndex ?? 0) - (y.toIndex ?? y.fromIndex ?? 0));
}

function counted(title: string, lines: LineDiff[]): SectionDiff {
  const counts = { added: 0, removed: 0, changed: 0, moved: 0, same: 0 };
  for (const l of lines) counts[l.status]++;
  return { title, lines, counts };
}

const entryTitle = (e: ResumeEntry) =>
  [e.position, e.company].filter(Boolean).join(" @ ") || e.company || "Experience";

export function diffResumes(before: ResumeData, after: ResumeData): SectionDiff[] {
  const sections: SectionDiff[] = [];

  sections.push(counted("Summary", pairLines(before.summary ?? [], after.summary ?? [])));
  sections.push(counted("Skills", pairLines(before.skills ?? [], after.skills ?? [])));

  const beforeRoles = before.work_experience ?? [];
  const afterRoles = after.work_experience ?? [];
  for (const b of beforeRoles) {
    const a = afterRoles.find((x) => x.company === b.company && x.start === b.start);
    sections.push(counted(entryTitle(b), pairLines(b.description ?? [], a?.description ?? [])));
  }

  const beforeProjects = before.projects ?? [];
  const afterProjects = after.projects ?? [];
  for (const b of beforeProjects) {
    const a = afterProjects.find((x) => x.company === b.company);
    sections.push(counted(`Project — ${entryTitle(b)}`, pairLines(b.description ?? [], a?.description ?? [])));
  }

  return sections.filter((s) => s.lines.length > 0);
}

export function diffTotals(sections: SectionDiff[]) {
  return sections.reduce(
    (t, s) => ({
      added: t.added + s.counts.added,
      removed: t.removed + s.counts.removed,
      changed: t.changed + s.counts.changed,
      moved: t.moved + s.counts.moved,
      same: t.same + s.counts.same,
    }),
    { added: 0, removed: 0, changed: 0, moved: 0, same: 0 },
  );
}

/**
 * Facts that must survive an edit. The prompt forbids changing these, so a
 * mismatch means the model ignored it — worth surfacing rather than trusting.
 */
export function integrityWarnings(before: ResumeData, after: ResumeData): string[] {
  const out: string[] = [];
  const bRoles = before.work_experience ?? [];
  const aRoles = after.work_experience ?? [];

  if (aRoles.length !== bRoles.length) {
    out.push(`Role count changed: ${bRoles.length} → ${aRoles.length}`);
  }
  for (const b of bRoles) {
    const a = aRoles.find((x) => x.company === b.company);
    if (!a) { out.push(`Role removed: ${entryTitle(b)}`); continue; }
    if (a.position !== b.position) out.push(`Job title changed at ${b.company}: "${b.position}" → "${a.position}"`);
    if (a.start !== b.start || a.end !== b.end) out.push(`Dates changed at ${b.company}: ${b.start}–${b.end} → ${a.start}–${a.end}`);
  }
  for (const a of aRoles) {
    if (!bRoles.some((b) => b.company === a.company)) out.push(`Role invented: ${entryTitle(a)}`);
  }

  const nums = (d: ResumeData) => {
    const text = JSON.stringify(d);
    return new Set((text.match(/\d[\d,.]*%?/g) ?? []).filter((n) => n.length > 1));
  };
  const bNums = nums(before);
  for (const n of nums(after)) {
    if (!bNums.has(n)) out.push(`Number not in the master résumé: ${n}`);
  }

  const eduBefore = (before.education ?? []).length;
  const eduAfter = (after.education ?? []).length;
  if (eduBefore !== eduAfter) out.push(`Education count changed: ${eduBefore} → ${eduAfter}`);

  return out;
}
