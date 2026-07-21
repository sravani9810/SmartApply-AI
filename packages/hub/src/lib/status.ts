/** Application lifecycle statuses used across the hub UI and the status API. */
export const JOB_STATUSES = [
  "new",
  "in-progress",
  "applied",
  "selected",
  "rejected",
  "not-applying",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export function isJobStatus(v: string): v is JobStatus {
  return (JOB_STATUSES as readonly string[]).includes(v);
}
