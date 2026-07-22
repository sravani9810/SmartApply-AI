import type { JobBoardConnector } from "@smartapply/shared";
import { exampleBoard } from "./example-board.js";
import { indeedBrowserBoard } from "./indeed-browser.js";
import { linkedinBrowserBoard } from "./linkedin-browser.js";

/** Every connector keyed by its source, so a caller can select boards by name. */
const ALL_BOARDS: Record<string, JobBoardConnector> = {
  indeed: indeedBrowserBoard,
  linkedin: linkedinBrowserBoard,
  example: exampleBoard,
};

/** The live boards a caller (e.g. the hub UI) may pick from, in display order. */
export const SELECTABLE_SOURCES = ["indeed", "linkedin"] as const;

/**
 * The active job-board connectors, chosen at call time.
 *
 * - With `sources` (e.g. platforms picked in the hub), return exactly those
 *   boards — this overrides the env flags, so the hub can drive a search on a
 *   board even if its `*_ENABLED` flag isn't set (it still needs that board's
 *   logged-in profile to return results).
 * - Without `sources`, fall back to the env-gated defaults: Indeed and/or
 *   LinkedIn when their flags are "true", else the synthetic example board.
 *
 * This is a function (not a module-level const) so it reads the env flags
 * *after* .env has been loaded — ESM evaluates imports before the dotenv call.
 */
export function getActiveBoards(sources?: string[]): JobBoardConnector[] {
  if (sources?.length) {
    const picked = sources
      .map((s) => ALL_BOARDS[s])
      .filter((b): b is JobBoardConnector => Boolean(b));
    if (picked.length) return picked;
  }
  const boards: JobBoardConnector[] = [];
  if (process.env.INDEED_ENABLED === "true") boards.push(indeedBrowserBoard);
  if (process.env.LINKEDIN_ENABLED === "true") boards.push(linkedinBrowserBoard);
  // Fall back to the synthetic board so the pipeline runs with no login set up.
  return boards.length ? boards : [exampleBoard];
}
