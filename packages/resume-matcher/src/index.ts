export { matchResume } from "./matcher.js";
export type { MatchOptions } from "./matcher.js";

import { readFile } from "node:fs/promises";
import { matchResume } from "./matcher.js";

/**
 * CLI: `node dist/index.js <resume.txt> <job-description.txt> [--tailor]`
 * Prints the MatchResult as JSON.
 */
async function main(): Promise<void> {
  const [resumePath, jdPath, ...flags] = process.argv.slice(2);
  if (!resumePath || !jdPath) {
    console.error(
      "usage: resume-matcher <resume.txt> <job-description.txt> [--tailor]",
    );
    process.exit(2);
  }
  const [resume, jd] = await Promise.all([
    readFile(resumePath, "utf8"),
    readFile(jdPath, "utf8"),
  ]);
  const result = await matchResume(resume, jd, {
    tailor: flags.includes("--tailor"),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
