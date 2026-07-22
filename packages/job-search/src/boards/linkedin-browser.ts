import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import type {
  JobBoardConnector,
  JobPosting,
  JobSearchQuery,
} from "@smartapply/shared";
import { stableId } from "./example-board.js";

/**
 * Live LinkedIn connector that reuses a persistent, logged-in Chrome profile —
 * same approach as the Indeed board. You sign into LinkedIn once via
 * `npm run login:linkedin`; the session cookies live in the profile directory
 * and are reused on every run, so the pipeline fetches results as you and
 * sidesteps the auth wall.
 *
 * Env:
 *   LINKEDIN_PROFILE_DIR  where the Chrome profile lives
 *                         (default ~/.config/smartapply/linkedin-profile)
 *   LINKEDIN_HEADLESS     "true" to run headless (LinkedIn's auth wall usually
 *                         blocks it; default is headed)
 *   LINKEDIN_SCROLLS      how many times to scroll the results to load more
 *                         cards (default 4)
 *   LINKEDIN_FETCH_DESCRIPTIONS  "false" to skip opening each posting for its
 *                                full description (faster, list-only)
 *   LINKEDIN_MAX_DESCRIPTIONS    cap how many postings get a description
 */
interface RawJob {
  jobId: string;
  title: string;
  company: string;
  location: string;
}

export function linkedinProfileDir(): string {
  return (
    process.env.LINKEDIN_PROFILE_DIR ??
    join(homedir(), ".config", "smartapply", "linkedin-profile")
  );
}

function headless(): boolean {
  return process.env.LINKEDIN_HEADLESS === "true";
}
function scrollCount(): number {
  const n = Number(process.env.LINKEDIN_SCROLLS);
  return Number.isFinite(n) && n >= 0 ? n : 4;
}
function fetchDescriptions(): boolean {
  return process.env.LINKEDIN_FETCH_DESCRIPTIONS !== "false";
}
function maxDescriptions(): number {
  const n = Number(process.env.LINKEDIN_MAX_DESCRIPTIONS);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
}

function buildSearchUrl(q: JobSearchQuery): string {
  const params = new URLSearchParams();
  params.set("keywords", q.keywords.join(" "));
  if (q.location) params.set("location", q.location);
  // f_TPR = "time posted range" in seconds (LinkedIn's recency filter).
  if (q.postedWithinDays) params.set("f_TPR", `r${q.postedWithinDays * 86_400}`);
  params.set("sortBy", "DD"); // most recent first
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

/**
 * Open a single posting and return its full description text, or undefined if
 * the page never rendered it. Reuses the logged-in page so the session carries.
 */
async function fetchDescription(
  page: import("playwright").Page,
  url: string,
): Promise<string | undefined> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    for (let i = 0; i < 12; i++) {
      const text = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>(
          "#job-details, .jobs-description__content, .show-more-less-html__markup, .jobs-box__html-content",
        );
        return el?.innerText?.trim() ?? "";
      });
      if (text) return text.replace(/\n{3,}/g, "\n\n");
      await page.waitForTimeout(750);
    }
  } catch {
    // best-effort — a missing description shouldn't fail the run
  }
  return undefined;
}

export const linkedinBrowserBoard: JobBoardConnector = {
  source: "linkedin",

  async search(query: JobSearchQuery): Promise<JobPosting[]> {
    const context = await chromium.launchPersistentContext(linkedinProfileDir(), {
      headless: headless(),
      channel: "chrome", // the installed Google Chrome, not bundled Chromium
      viewport: { width: 1280, height: 900 },
      args: ["--disable-blink-features=AutomationControlled"],
    });
    try {
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(buildSearchUrl(query), {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });

      // Wait for job cards. Each posting links to /jobs/view/<id>/.
      let cleared = false;
      for (let i = 0; i < 25; i++) {
        const n = await page.evaluate(
          () => document.querySelectorAll('a[href*="/jobs/view/"]').length,
        );
        if (n > 0) { cleared = true; break; }
        await page.waitForTimeout(1000);
      }
      if (!cleared) {
        const title = await page.title();
        throw new Error(
          `LinkedIn returned no job cards (page: "${title}"). Likely the auth ` +
            `wall: sign in once with \`npm run login:linkedin\` (and keep ` +
            `LINKEDIN_HEADLESS unset — headless is usually blocked).`,
        );
      }

      // Scroll the results pane to load more (LinkedIn lazy-loads/virtualizes).
      for (let i = 0; i < scrollCount(); i++) {
        await page.evaluate(() => {
          const list = document.querySelector(
            ".jobs-search-results-list, .scaffold-layout__list, ul.jobs-search__results-list",
          );
          (list ?? document.scrollingElement ?? document.body).scrollBy(0, 1500);
          window.scrollBy(0, 1500);
        });
        await page.waitForTimeout(1200);
      }

      const raw = (await page.evaluate(() => {
        const seen = new Set<string>();
        const out: RawJob[] = [];
        const anchors = document.querySelectorAll<HTMLAnchorElement>(
          'a[href*="/jobs/view/"]',
        );
        anchors.forEach((a) => {
          const m = (a.href || "").match(/\/jobs\/view\/(\d+)/);
          const jobId = m && m[1];
          if (!jobId || seen.has(jobId)) return;
          const card =
            a.closest("li") ??
            a.closest(".job-card-container, .base-search-card, .base-card") ??
            document.body;
          const txt = (sel: string) =>
            (card.querySelector(sel)?.textContent ?? "").replace(/\s+/g, " ").trim();
          const title =
            txt(".job-card-list__title") ||
            txt(".base-search-card__title") ||
            (a.getAttribute("aria-label") || "").trim() ||
            (a.textContent ?? "").replace(/\s+/g, " ").trim();
          if (!title) return;
          seen.add(jobId);
          out.push({
            jobId,
            title,
            company:
              txt(".job-card-container__primary-description") ||
              txt(".artdeco-entity-lockup__subtitle") ||
              txt(".base-search-card__subtitle"),
            location:
              txt(".job-card-container__metadata-item") ||
              txt(".artdeco-entity-lockup__caption") ||
              txt(".job-search-card__location"),
          });
        });
        return out;
      })) as RawJob[];

      const now = new Date().toISOString();
      const postings = raw.map((j): JobPosting => {
        const url = `https://www.linkedin.com/jobs/view/${j.jobId}/`;
        return {
          id: stableId("linkedin", url),
          title: j.title,
          company: j.company,
          location: j.location || query.location,
          source: "linkedin",
          url,
          datePosted: undefined, // list view doesn't expose a reliable ISO date
          endDate: undefined,
          recruiter: undefined,
          status: "new",
          capturedAt: now,
        };
      });

      // Enrich with full descriptions (sequential, best-effort).
      if (fetchDescriptions()) {
        const limit = maxDescriptions();
        let done = 0;
        for (const posting of postings) {
          if (done >= limit) break;
          posting.description = await fetchDescription(page, posting.url);
          done++;
        }
        const withDesc = postings.filter((p) => p.description).length;
        console.log(
          `[job-search] linkedin: captured ${withDesc}/${Math.min(limit, postings.length)} description(s)`,
        );
      }

      return postings;
    } finally {
      await context.close();
    }
  },
};
