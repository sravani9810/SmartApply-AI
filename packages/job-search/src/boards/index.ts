import type { JobBoardConnector } from "@smartapply/shared";
import { exampleBoard } from "./example-board.js";
import { indeedBrowserBoard } from "./indeed-browser.js";

/**
 * Registry of active job-board connectors.
 *
 * The live Indeed connector (which drives a logged-in Chrome profile) is enabled
 * with INDEED_ENABLED=true. Without it, the pipeline uses the synthetic
 * example-board so it still runs with no browser/login set up.
 *
 * Add more boards (LinkedIn, Dice, Greenhouse, …) by implementing
 * JobBoardConnector and including them here.
 */
export const boards: JobBoardConnector[] =
  process.env.INDEED_ENABLED === "true" ? [indeedBrowserBoard] : [exampleBoard];
