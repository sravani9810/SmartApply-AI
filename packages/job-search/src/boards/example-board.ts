import { createHash } from "node:crypto";
import type {
  JobBoardConnector,
  JobPosting,
  JobSearchQuery,
} from "@smartapply/shared";

/**
 * Reference connector. Returns a single synthetic posting so the pipeline is
 * runnable end-to-end without network access or portal credentials.
 *
 * A real connector replaces `search()` with an HTTP/scrape call against the
 * board and normalizes the response into JobPosting[]. Keep the shape identical
 * so the rest of the pipeline (Excel logging, matching) stays board-agnostic.
 */
export const exampleBoard: JobBoardConnector = {
  source: "example",

  async search(query: JobSearchQuery): Promise<JobPosting[]> {
    const url = "https://example.com/jobs/1001";
    return [
      {
        id: stableId("example", url),
        title: "Software Engineer",
        company: "Example Corp",
        location: query.location ?? "Remote",
        source: "example",
        url,
        datePosted: new Date().toISOString().slice(0, 10),
        endDate: undefined,
        description:
          "Build TypeScript services. Requires TypeScript, Node.js, REST APIs.",
        recruiter: { name: "Jane Recruiter", email: "jane@example.com" },
        status: "new",
        capturedAt: new Date().toISOString(),
      },
    ];
  },
};

/** Deterministic id so re-running the search de-duplicates the same posting. */
export function stableId(source: string, url: string): string {
  return createHash("sha1").update(`${source}::${url}`).digest("hex").slice(0, 16);
}
