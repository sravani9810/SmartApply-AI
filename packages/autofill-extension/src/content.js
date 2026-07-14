// Content script: fills the visible application form with the saved profile.
// Self-contained (MV3 content scripts can't import ES modules). Keep the field
// list in sync with profile.js.
//
// Runs two ways:
//   1. Auto-fill when an application page opens (if the setting is on).
//   2. On demand from the popup, which injects this file and calls
//      window.__smartApplyFill(profile, submit).
// Wrapped in a guarded IIFE so re-injection (on-demand Fill) is a no-op and
// doesn't redeclare top-level bindings. Fills only EMPTY fields; never auto-submits.

(() => {
  if (window.__smartApplyInit) return;
  window.__smartApplyInit = true;

  // Field -> substrings matched (case-insensitive) against a field's
  // name/id/label/placeholder/aria-label. Ordered specific-first; first match wins.
  const FIELD_MATCHERS = {
    firstName: ["first name", "firstname", "given name", "legal first name", "preferred first name", "fname"],
    lastName: ["last name", "lastname", "surname", "family name", "legal last name", "lname"],
    fullName: ["full name", "full legal name", "legal name", "your name"],
    email: ["email", "e-mail", "e mail"],
    phone: ["phone", "mobile", "telephone", "cell", "tel", "contact number"],
    linkedin: ["linkedin"],
    website: ["website", "portfolio", "personal site", "personal website", "web site"],
    address: ["street address", "address line 1", "mailing address", "residential address", "current address", "address"],
    city: ["city", "town"],
    state: ["state", "province", "region"],
    zipcode: ["zip", "postal", "postcode", "pin code", "post code"],
    country: ["country", "nationality"],
    currentCompany: ["current company", "current employer", "present employer", "present company", "employer"],
    currentTitle: ["current title", "job title", "current role", "current position", "present position", "designation", "occupation"],
    yearsExperience: ["years of experience", "years experience", "total experience", "yrs of experience", "how many years"],
    coverLetter: ["cover letter", "cover note", "why do you", "why are you", "additional information", "introduce yourself", "tell us", "message"],
  };

  /** Resolve the value for a field, deriving fullName from first + last. */
  function valueFor(profile, field) {
    if (field === "fullName" && !profile.fullName) {
      return [profile.firstName, profile.lastName].filter(Boolean).join(" ");
    }
    return profile[field] ?? "";
  }

  /** input/textarea/select across the document AND open shadow roots. */
  function deepFields(root = document) {
    const out = [];
    const walk = (node) => {
      out.push(...node.querySelectorAll("input, textarea, select"));
      for (const el of node.querySelectorAll("*")) {
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    walk(root);
    return out;
  }

  /** Select the <option> that best matches value (exact, then contains). */
  function fillSelect(el, value) {
    const v = value.toLowerCase();
    const opts = [...el.options];
    const match =
      opts.find((o) => o.value.toLowerCase() === v || o.text.trim().toLowerCase() === v) ||
      opts.find((o) => o.text.trim().toLowerCase().includes(v) && o.value);
    if (match) {
      el.value = match.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  }

  /** Best-effort label text for an input, from attributes and associated labels. */
  function fieldSignals(el) {
    const root = el.getRootNode();
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

  const isChoice = (el) =>
    el.tagName === "INPUT" && (el.type === "radio" || el.type === "checkbox");

  /** Fill matching text inputs, textareas, and native selects. */
  function fillForm(profile) {
    let filled = 0;
    for (const el of deepFields()) {
      if (!fillable(el) || isChoice(el)) continue; // choices handled separately
      const isSelect = el.tagName === "SELECT";
      if (!isSelect && el.value.trim()) continue; // skip filled text inputs
      const field = fieldFor(el);
      if (!field) continue;
      const value = valueFor(profile, field);
      if (!value) continue;
      if (isSelect) {
        if (el.value) continue; // leave a select the user already chose
        if (fillSelect(el, value)) filled++;
      } else {
        setValue(el, value);
        filled++;
      }
    }
    return filled;
  }

  // Questions answered via radio/checkbox, matched against the group's label.
  const CHOICE_MATCHERS = {
    workAuthorized: ["authorized to work", "work authorization", "legally authorized", "eligible to work", "right to work"],
    requiresSponsorship: ["require sponsorship", "need sponsorship", "visa sponsorship", "sponsorship now or in the future"],
    gender: ["gender"],
    veteranStatus: ["veteran"],
    disabilityStatus: ["disability"],
  };
  // Never auto-tick these — accepting them is a deliberate action.
  const CONSENT_RE = /agree|terms|privacy|consent|subscribe|newsletter|opt.?in|acknowledge|certify/i;

  function choiceFieldFor(text) {
    for (const [field, needles] of Object.entries(CHOICE_MATCHERS)) {
      if (needles.some((n) => text.includes(n))) return field;
    }
    return null;
  }

  /** Text identifying one specific radio/checkbox option (its own label/value). */
  function optionLabel(el) {
    const root = el.getRootNode();
    const parts = [el.value, el.getAttribute("aria-label")];
    if (el.id && root.querySelector) {
      const l = root.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) parts.push(l.textContent);
    }
    const wrap = el.closest("label");
    if (wrap) parts.push(wrap.textContent);
    return parts.filter(Boolean).join(" ").trim().toLowerCase();
  }

  /** The question text for a radio/checkbox group (fieldset legend / ARIA group). */
  function groupQuestion(el) {
    const legend = el.closest("fieldset")?.querySelector("legend");
    if (legend) return legend.textContent.toLowerCase();
    const group = el.closest('[role="radiogroup"], [role="group"]');
    if (group) {
      const al = group.getAttribute("aria-label");
      if (al) return al.toLowerCase();
      const lb = group.getAttribute("aria-labelledby");
      const root = el.getRootNode();
      if (lb && root.getElementById) {
        const t = lb.split(/\s+/).map((id) => root.getElementById(id)?.textContent ?? "").join(" ");
        if (t.trim()) return t.toLowerCase();
      }
    }
    return "";
  }

  /** Select radio options and tick yes/no checkboxes from the profile answers. */
  function fillChoices(profile) {
    let filled = 0;
    const radioGroups = new Map();
    const checkboxes = [];
    for (const el of deepFields()) {
      if (!isChoice(el) || !fillable(el)) continue;
      if (el.type === "radio") {
        const key = el.name || `__${radioGroups.size}`;
        if (!radioGroups.has(key)) radioGroups.set(key, []);
        radioGroups.get(key).push(el);
      } else {
        checkboxes.push(el);
      }
    }

    for (const group of radioGroups.values()) {
      if (group.some((r) => r.checked)) continue; // already answered
      const question = group.map(groupQuestion).find(Boolean) || "";
      const field = choiceFieldFor(question);
      const answer = (profile[field] ?? "").toLowerCase();
      if (!field || !answer) continue;
      const pick = group.find((r) => {
        const opt = optionLabel(r);
        return opt && (opt.includes(answer) || answer.includes(opt));
      });
      if (pick) {
        pick.checked = true;
        pick.dispatchEvent(new Event("change", { bubbles: true }));
        filled++;
      }
    }

    for (const el of checkboxes) {
      if (el.checked) continue;
      const opt = optionLabel(el);
      const context = `${opt} ${groupQuestion(el)}`;
      if (CONSENT_RE.test(context)) continue; // never auto-accept consent/terms
      const field = choiceFieldFor(context);
      const answer = (profile[field] ?? "").toLowerCase();
      // Only tick an affirmative box when the saved answer is "yes".
      if (field && answer === "yes" && /\byes\b|authorized|eligible/.test(opt)) {
        el.checked = true;
        el.dispatchEvent(new Event("change", { bubbles: true }));
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

  // Entry point the popup calls via chrome.scripting.executeScript.
  window.__smartApplyFill = (profile, submit) => ({
    filled: fillForm(profile) + fillChoices(profile),
    submitted: submit ? submitForm() : false,
  });

  // --- Auto-fill when an application page opens ---
  (async function autoFillOnOpen() {
    const { settings, profile } = await chrome.storage.sync.get(["settings", "profile"]);
    if (!(settings?.autofillOnOpen ?? true) || !profile) return;

    let done = false;
    const tryFill = () => {
      if (done) return;
      if (looksLikeApplicationForm()) {
        fillForm(profile);
        fillChoices(profile);
        done = true;
        observer.disconnect();
      }
    };
    // ATS forms (Greenhouse/Lever/Workday) render late, so watch briefly.
    const observer = new MutationObserver(() => tryFill());
    observer.observe(document.body, { childList: true, subtree: true });
    tryFill();
    setTimeout(() => observer.disconnect(), 20_000);
  })();
})();
