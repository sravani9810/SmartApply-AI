import type { JobBoardConnector } from "@smartapply/shared";
import { exampleBoard } from "./example-board.js";
import { indeedBrowserBoard } from "./indeed-browser.js";
import { linkedinBrowserBoard } from "./linkedin-browser.js";

/**
 * The active job-board connectors, chosen at call time.
 *
 * The live Indeed connector (which drives a logged-in Chrome profile) is enabled
 * with INDEED_ENABLED=true. Without it, the pipeline uses the synthetic
 * example-board so it still runs with no browser/login set up.
 *
 * This is a function (not a module-level const) so it reads INDEED_ENABLED
 * *after* .env has been loaded — otherwise the value from .env would be missed,
 * since ESM evaluates imports before the dotenv call runs.
 *
 * Add more boards (LinkedIn, Dice, Greenhouse, …) by implementing
 * JobBoardConnector and including them here.
 */
export function getActiveBoards(): JobBoardConnector[] {
  const boards: JobBoardConnector[] = [];
  if (process.env.INDEED_ENABLED === "true") boards.push(indeedBrowserBoard);
  if (process.env.LINKEDIN_ENABLED === "true") boards.push(linkedinBrowserBoard);
  // Fall back to the synthetic board so the pipeline runs with no login set up.
  return boards.length ? boards : [exampleBoard];
}
