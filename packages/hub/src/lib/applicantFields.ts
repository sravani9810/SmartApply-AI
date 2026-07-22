/**
 * The application-form fields the hub stores and the extension fills. This is
 * the single source of truth for the applicant's personal data — the extension
 * no longer keeps its own field list; it loads these values from the hub.
 *
 * Keys must match the FIELD_MATCHERS keys in the extension's content.js so a
 * matched form field maps to the right value.
 */
export interface ApplicantField {
  key: string;
  label: string;
  type?: "email" | "tel" | "textarea";
  /** Grouping for the hub profile page. */
  group: "identity" | "contact" | "address" | "work" | "eligibility" | "eeo";
  hint?: string;
}

export const APPLICANT_FIELDS: ApplicantField[] = [
  { key: "firstName", label: "First name", group: "identity" },
  { key: "lastName", label: "Last name", group: "identity" },
  { key: "email", label: "Email", type: "email", group: "contact" },
  { key: "phone", label: "Phone", type: "tel", group: "contact" },
  { key: "linkedin", label: "LinkedIn URL", group: "contact" },
  { key: "website", label: "Website / Portfolio", group: "contact" },
  { key: "address", label: "Street address", group: "address" },
  { key: "city", label: "City", group: "address" },
  { key: "state", label: "State / Province", group: "address" },
  { key: "zipcode", label: "ZIP / Postal code", group: "address" },
  { key: "country", label: "Country", group: "address" },
  { key: "currentCompany", label: "Current company", group: "work" },
  { key: "currentTitle", label: "Current title", group: "work" },
  { key: "yearsExperience", label: "Years of experience", group: "work" },
  { key: "coverLetter", label: "Cover letter", type: "textarea", group: "work" },
  { key: "workAuthorized", label: "Authorized to work?", group: "eligibility", hint: "Yes / No" },
  { key: "requiresSponsorship", label: "Need visa sponsorship?", group: "eligibility", hint: "Yes / No" },
  { key: "gender", label: "Gender", group: "eeo", hint: "optional, EEO" },
  { key: "veteranStatus", label: "Veteran status", group: "eeo", hint: "optional, EEO" },
  { key: "disabilityStatus", label: "Disability status", group: "eeo", hint: "optional, EEO" },
];

export const APPLICANT_FIELD_KEYS = APPLICANT_FIELDS.map((f) => f.key);

export const APPLICANT_GROUPS: { id: ApplicantField["group"]; label: string }[] = [
  { id: "identity", label: "Identity" },
  { id: "contact", label: "Contact" },
  { id: "address", label: "Address" },
  { id: "work", label: "Work" },
  { id: "eligibility", label: "Work eligibility" },
  { id: "eeo", label: "Voluntary self-identification (EEO)" },
];
