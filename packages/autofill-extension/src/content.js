// Content script: fills the visible application form with the saved profile.
// Self-contained (MV3 content scripts can't import ES modules). Keep the field
// list in sync with profile.js.
//
// Two ways it runs:
//   1. Auto-fill when an application page opens (if the setting is on).
//   2. On demand from the popup (Fill / Fill & Submit).
// It fills only EMPTY fields and never auto-submits.

// Field -> substrings matched (case-insensitive) against a field's
// name/id/label/placeholder/aria-label. Ordered specific-first; first match wins.
const FIELD_MATCHERS = {
  firstName: ["first name", "firstname", "given name", "fname"],
  lastName: ["last name", "lastname", "surname", "family name", "lname"],
  fullName: ["full name", "full legal name", "legal name", "your name"],
  email: ["email", "e-mail"],
  phone: ["phone", "mobile", "tel", "contact number"],
  linkedin: ["linkedin"],
  website: ["website", "portfolio", "personal site", "personal website"],
  address: ["street address", "address line 1", "mailing address", "address"],
  city: ["city", "town"],
  state: ["state", "province", "region"],
  zipcode: ["zip", "postal", "postcode", "pin code"],
  country: ["country"],
  currentCompany: ["current company", "current employer", "present employer", "employer"],
  currentTitle: ["current title", "job title", "current role", "current position", "occupation"],
  yearsExperience: ["years of experience", "years experience", "total experience", "yrs of experience"],
  coverLetter: ["cover letter", "why do you", "why are you", "additional information", "tell us", "message"],
};

/** Resolve the value for a field, deriving fullName from first + last. */
function valueFor(profile, field) {
  if (field === "fullName" && !profile.fullName) {
    const full = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
    return full || "";
  }
  return profile[field] ?? "";
}

/** Collect input/textarea across the document AND open shadow roots (Workday
 * and other web-component forms nest fields inside shadow DOM). */
function deepFields(root = document) {
  const out = [];
  const walk = (node) => {
    out.push(...node.querySelectorAll("input, textarea"));
    for (const el of node.querySelectorAll("*")) {
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(root);
  return out;
}

/** Best-effort label text for an input, from attributes and associated labels. */
function fieldSignals(el) {
  const root = el.getRootNode(); // the field's document or shadow root
  const parts = [el.name, el.id, el.getAttribute("aria-label"), el.placeholder];
  if (el.id && root.querySelector) {
    const forLabel = root.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (forLabel) parts.push(forLabel.textContent);
  }
  const wrapLabel = el.closest("label");
  if (wrapLabel) parts.push(wrapLabel.textContent);
  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby && root.getElementById) {
    for (const id of labelledby.split(/\s+/)) {
      parts.push(root.getElementById(id)?.textContent);
    }
  }
  return parts.filter(Boolean).join(" ").toLowerCase();
}

/** Which field (if any) an input maps to. */
function fieldFor(el) {
  const signals = fieldSignals(el);
  if (!signals) return null;
  for (const [field, needles] of Object.entries(FIELD_MATCHERS)) {
    if (needles.some((n) => signals.includes(n))) return field;
  }
  return null;
}

/** Set a value in a way React/Vue controlled inputs will notice. */
function setValue(el, value) {
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

const fillable = (el) =>
  !el.disabled &&
  !el.readOnly &&
  el.type !== "hidden" &&
  el.type !== "password" &&
  el.type !== "file" && // browsers forbid setting file inputs from script
  el.offsetParent !== null; // visible

/** Fill matching, empty inputs with the profile. Returns the count filled. */
function fillForm(profile) {
  let filled = 0;
  for (const el of deepFields()) {
    if (!fillable(el) || el.value.trim()) continue; // skip filled fields
    const field = fieldFor(el);
    if (!field) continue;
    const value = valueFor(profile, field);
    if (value) {
      setValue(el, value);
      filled++;
    }
  }
  return filled;
}

/** Heuristic: does this page look like an application form? (>= 2 known fields) */
function looksLikeApplicationForm() {
  const seen = new Set();
  for (const el of deepFields()) {
    if (!fillable(el)) continue;
    const field = fieldFor(el);
    if (field) seen.add(field);
    if (seen.size >= 2) return true;
  }
  return false;
}

function submitForm() {
  const btn = [...document.querySelectorAll("button, input[type=submit]")].find(
    (b) => /submit|apply|send/i.test(b.textContent || b.value || ""),
  );
  if (btn) {
    btn.click();
    return true;
  }
  return false;
}

// --- On-demand from the popup ---
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "AUTOFILL") {
    const filled = fillForm(msg.profile);
    const submitted = msg.submit ? submitForm() : false;
    sendResponse({ filled, submitted });
  }
  return true;
});

// --- Auto-fill when an application page opens ---
(async function autoFillOnOpen() {
  const { settings, profile } = await chrome.storage.sync.get(["settings", "profile"]);
  const on = settings?.autofillOnOpen ?? true;
  if (!on || !profile) return;

  let done = false;
  const tryFill = () => {
    if (done) return;
    if (looksLikeApplicationForm()) {
      fillForm(profile);
      done = true;
      observer.disconnect();
    }
  };

  // Many ATS forms (Greenhouse, Lever, Workday) render after load, so watch the
  // DOM for a short window and fill once the form appears.
  const observer = new MutationObserver(() => tryFill());
  observer.observe(document.body, { childList: true, subtree: true });
  tryFill();
  setTimeout(() => observer.disconnect(), 20_000);
})();
