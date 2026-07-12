import type { JobBoardConnector } from "@smartapply/shared";
import { exampleBoard } from "./example-board.js";

/**
 * Registry of all job-board connectors. Add new boards (LinkedIn, Greenhouse,
 * Lever, Indeed, …) by implementing JobBoardConnector and pushing them here.
 */
export const boards: JobBoardConnector[] = [exampleBoard];
