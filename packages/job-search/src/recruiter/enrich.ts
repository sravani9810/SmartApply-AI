import type { JobPosting, RecruiterContact } from "@smartapply/shared";

/**
 * Enrich a posting with recruiter contact details (email, phone) when the board
 * didn't already supply them. This is a hook point: plug in a contact-lookup
 * provider or a parser over the job description here.
 *
 * The default implementation is a no-op passthrough that keeps any contact the
 * connector already found.
 */
export async function enrichRecruiterContact(
  posting: JobPosting,
): Promise<JobPosting> {
  if (hasContact(posting.recruiter)) return posting;

  const recruiter = await lookupContact(posting);
  return recruiter ? { ...posting, recruiter } : posting;
}

function hasContact(c?: RecruiterContact): boolean {
  return Boolean(c && (c.email || c.phone));
}

/** Stub lookup — replace with a real enrichment source. */
async function lookupContact(_posting: JobPosting): Promise<RecruiterContact | undefined> {
  return undefined;
}
