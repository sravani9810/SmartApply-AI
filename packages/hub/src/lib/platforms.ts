/** The job-search platforms the hub can scrape from (matches board `source`s). */
export const PLATFORMS = [
  { key: "indeed", label: "Indeed" },
  { key: "linkedin", label: "LinkedIn" },
] as const;

export const PLATFORM_KEYS: string[] = PLATFORMS.map((p) => p.key);
