import type { ResumeData } from "@smartapply/shared";
import baseJson from "./baseResume.json";
import { getSetting, setSetting } from "../db/queries";

/**
 * The fixed master résumé that job-specific versions are edited from.
 *
 * Snapshotted from resume-builder's `product_fullstack` variant, whose source
 * of truth is revanth_resume_product.docx. It lives here as JSON rather than a
 * cross-package import so the hub has no build-time dependency on
 * resume-builder, and so the base can be re-pointed without a code change.
 *
 * This is deliberately NOT the flavor/bullet-library path used by tailorForJob:
 * that composes a résumé from scratch each time, so the starting point drifts
 * as the library changes. A master is supposed to be stable — the diff view is
 * only meaningful against something that doesn't move.
 */
export const BASE_RESUME_KEY = "sde_product_master";

const SETTINGS_KEY = "baseResume:override";

export function getBaseResume(): ResumeData {
  const override = getSetting<ResumeData>(SETTINGS_KEY);
  return override ?? (baseJson as unknown as ResumeData);
}

/** Replace the master with an edited version (e.g. promoting a tailored one). */
export function setBaseResume(data: ResumeData) {
  setSetting(SETTINGS_KEY, data);
}

export function resetBaseResume() {
  setSetting(SETTINGS_KEY, null);
}

/** Bullet/skill/summary counts, for showing what the base contains. */
export function baseResumeStats(data: ResumeData = getBaseResume()) {
  const bullets = (data.work_experience ?? []).reduce(
    (n, e) => n + (e.description?.length ?? 0), 0,
  );
  return {
    roles: data.work_experience?.length ?? 0,
    bullets,
    skills: data.skills?.length ?? 0,
    summary: data.summary?.length ?? 0,
    projects: data.projects?.length ?? 0,
  };
}
