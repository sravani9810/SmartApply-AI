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
 * Live Indeed connector that reuses a persistent, logged-in Chrome profile
 * (Option B). You sign into Indeed once via `npm run login:indeed`; the session
 * cookies are stored in the profile directory and reused on every run — so the
 * hourly pipeline can fetch results as you, sidestepping bot/login walls.
 *
 * Env:
 *   INDEED_PROFILE_DIR  where the Chrome profile lives
 *                       (default ~/.config/smartapply/chrome-profile)
 *   INDEED_HEADLESS     "false" to watch the browser; default headless
 */
interface RawJob {
  jk: string;
  title: string;
  company: string;
  location: string;
}

export function indeedProfileDir(): string {
  return (
    process.env.INDEED_PROFILE_DIR ??
    join(homedir(), ".config", "smartapply", "chrome-profile")
  );
}

function headless(): boolean {
  // Indeed's Cloudflare protection HARD-BLOCKS headless Chrome ("You have been
  // blocked"), so we default to headed. Setting INDEED_HEADLESS=true is only for
  // debugging and will be blocked.
  return process.env.INDEED_HEADLESS === "true";
}

function buildSearchUrl(q: JobSearchQuery): string {
  const params = new URLSearchParams();
  params.set("q", q.keywords.join(" "));
  if (q.location) params.set("l", q.location);
  if (q.postedWithinDays) params.set("fromage", String(q.postedWithinDays));
  return `https://www.indeed.com/jobs?${params.toString()}`;
}

export const indeedBrowserBoard: JobBoardConnector = {
  source: "indeed",

  async search(query: JobSearchQuery): Promise<JobPosting[]> {
    const context = await chromium.launchPersistentContext(indeedProfileDir(), {
      headless: headless(),
      channel: "chrome", // use the installed Google Chrome, not bundled Chromium
      viewport: { width: 1280, height: 900 },
      // Hide the automation fingerprint (navigator.webdriver) so Cloudflare's
      // managed challenge auto-clears instead of hard-blocking.
      args: ["--disable-blink-features=AutomationControlled"],
    });
    try {
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(buildSearchUrl(query), {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });

      // Indeed sits behind Cloudflare. On load it may show a "Just a moment…"
      // challenge that resolves itself after a few seconds. Poll for job cards
      // to appear (challenge cleared) before extracting.
      let cleared = false;
      for (let i = 0; i < 25; i++) {
        const n = await page.evaluate(
          () => document.querySelectorAll('a[href*="jk="], a[data-jk]').length,
        );
        if (n > 0) {
          cleared = true;
          break;
        }
        await page.waitForTimeout(1000);
      }
      if (!cleared) {
        const title = await page.title();
        throw new Error(
          `Indeed returned no results (page: "${title}"). Likely a Cloudflare ` +
            `bot block: ensure INDEED_HEADLESS is not "true" (headless is blocked) ` +
            `and that you are logged in via \`npm run login:indeed\`.`,
        );
      }

      const raw = (await page.evaluate(() => {
        const seen = new Set<string>();
        const out: RawJob[] = [];
        const anchors = document.querySelectorAll<HTMLAnchorElement>(
          'a[href*="jk="], a[id^="job_"], a[data-jk]',
        );
        anchors.forEach((a) => {
          const href = a.href || "";
          const m = href.match(/[?&]jk=([0-9a-f]+)/);
          const jk =
            (m && m[1]) ||
            a.getAttribute("data-jk") ||
            (a.id.startsWith("job_") ? a.id.slice(4) : "");
          if (!jk || seen.has(jk)) return;
          const title =
            a.querySelector("span[title]")?.getAttribute("title") ||
            a.textContent?.trim() ||
            "";
          if (!title) return;
          seen.add(jk);
          const card =
            a.closest("div.job_seen_beacon") ?? a.closest("li") ?? document.body;
          const txt = (sel: string) =>
            card.querySelector(sel)?.textContent?.trim() ?? "";
          out.push({
            jk,
            title,
            company: txt('[data-testid="company-name"]'),
            location: txt('[data-testid="text-location"]'),
          });
        });
        return out;
        // Note: RawJob is declared in the module scope for TS; page.evaluate
        // runs in the browser where it's just a plain object shape.
      })) as RawJob[];

      const now = new Date().toISOString();
      return raw
        .filter((j) => j.company) // drop Indeed's promo carousel cards (no company)
        .map((j): JobPosting => {
          const url = `https://www.indeed.com/viewjob?jk=${j.jk}`;
          return {
            id: stableId("indeed", url),
            title: j.title,
            company: j.company,
            location: j.location || query.location,
            source: "indeed",
            url,
            datePosted: undefined, // Indeed's list view doesn't expose this
            endDate: undefined,
            recruiter: undefined,
            status: "new",
            capturedAt: now,
          };
        });
    } finally {
      await context.close();
    }
  },
};
