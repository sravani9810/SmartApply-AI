// Content script: fills the visible application form with the saved profile,
// plus answers it has "learned" from what you've typed on past forms.
// Self-contained (MV3 content scripts can't import). Keep field list in sync
// with profile.js. Wrapped in a guarded IIFE so on-demand re-injection is a
// no-op. Fills only EMPTY fields; never auto-submits.

(() => {
  if (window.__smartApplyInit) return;
  window.__smartApplyInit = true;

  // Learned answers ({ normalizedLabel: value }) and settings, cached here and
  // kept fresh via storage change events.
  let learned = {};
  // Curated answer bank (AnswerEntry[]) from the Options page — see
  // @smartapply/shared. Takes priority over learned when filling.
  let answers = [];
  let learningEnabled = true;
  let isAppPage = false; // gate learning to application-like pages
  let hubUrl = "http://localhost:3100"; // where learned answers are recorded

  /** Push a learned answer to the hub so it's stored centrally (best-effort). */
  async function postLearnedToHub(label, value) {
    try {
      await fetch(`${hubUrl.replace(/\/+$/, "")}/api/learned`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, value }),
      });
    } catch { /* hub offline / different host — the local cache still has it */ }
  }

  // Field -> substrings matched against a field's label/name/id/placeholder.
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

  const CHOICE_MATCHERS = {
    workAuthorized: ["authorized to work", "work authorization", "legally authorized", "eligible to work", "right to work"],
    requiresSponsorship: ["require sponsorship", "need sponsorship", "visa sponsorship", "sponsorship now or in the future"],
    gender: ["gender"],
    veteranStatus: ["veteran"],
    disabilityStatus: ["disability"],
  };
  const CONSENT_RE = /agree|terms|privacy|consent|subscribe|newsletter|opt.?in|acknowledge|certify/i;

  const norm = (s) => (s || "").replace(/[\s*:_-]+/g, " ").trim().toLowerCase();

  // True while this content script can still reach the extension APIs. After the
  // extension is reloaded or updated, content scripts already running in open
  // tabs are orphaned and any chrome.* call throws "Extension context
  // invalidated" / "receiving end does not exist". Guard storage access with it.
  const extAlive = () => {
    try {
      return Boolean(chrome.runtime?.id);
    } catch {
      return false;
    }
  };

  const AFFIRMATIVE_RE = /^(yes|true|checked)$/i;

  /**
   * Best curated answer whose question/aliases match a field's label, scored by
   * the longest matched phrase (more specific wins). `types` limits which entry
   * kinds are eligible (e.g. ["radio"] when filling a radio group).
   */
  function matchAnswer(label, types, entries = answers) {
    const L = norm(label);
    if (!L || !Array.isArray(entries)) return null;
    let best = null;
    let bestLen = 0;
    for (const e of entries) {
      if (!e || !types.includes(e.type) || !e.value) continue;
      const needles = [e.question, ...(e.aliases || [])].map(norm).filter(Boolean);
      for (const n of needles) {
        if ((L.includes(n) || n.includes(L)) && n.length > bestLen) {
          best = e;
          bestLen = n.length;
        }
      }
    }
    return best;
  }

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
      for (const el of node.querySelectorAll("*")) if (el.shadowRoot) walk(el.shadowRoot);
    };
    walk(root);
    return out;
  }

  /** Best signals for matching a field to a known type. */
  function fieldSignals(el) {
    const root = el.getRootNode();
    const parts = [el.name, el.id, el.getAttribute("aria-label"), el.placeholder];
    if (el.id && root.querySelector) {
      const l = root.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) parts.push(l.textContent);
    }
    const wrap = el.closest("label");
    if (wrap) parts.push(wrap.textContent);
    const lb = el.getAttribute("aria-labelledby");
    if (lb && root.getElementById) {
      for (const id of lb.split(/\s+/)) parts.push(root.getElementById(id)?.textContent);
    }
    return parts.filter(Boolean).join(" ").toLowerCase();
  }

  /** The single human-readable label for a field, used as the learning key. */
  function humanLabel(el) {
    const root = el.getRootNode();
    let label = el.getAttribute("aria-label") || "";
    if (!label && el.id && root.querySelector) {
      label = root.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent || "";
    }
    if (!label) label = el.closest("label")?.textContent || "";
    if (!label) label = el.placeholder || el.name || "";
    return norm(label);
  }

  function fieldFor(el) {
    const signals = fieldSignals(el);
    if (!signals) return null;
    for (const [field, needles] of Object.entries(FIELD_MATCHERS)) {
      if (needles.some((n) => signals.includes(n))) return field;
    }
    return null;
  }

  function setValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fillSelect(el, value) {
    const v = value.toLowerCase();
    const opts = [...el.options];
    const match =
      opts.find((o) => o.value.toLowerCase() === v || o.text.trim().toLowerCase() === v) ||
      opts.find((o) => o.value && o.text.trim().toLowerCase().includes(v));
    if (match) {
      el.value = match.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  }

  const isChoice = (el) =>
    el.tagName === "INPUT" && (el.type === "radio" || el.type === "checkbox");

  const fillable = (el) =>
    !el.disabled &&
    !el.readOnly &&
    el.type !== "hidden" &&
    el.type !== "password" &&
    el.type !== "file" &&
    el.offsetParent !== null;

  /**
   * Fill text/textarea/select. Precedence per field: profile field match ->
   * curated answer bank -> auto-learned answers.
   */
  function fillForm(profile, learnedMap = learned, answerList = answers) {
    let filled = 0;
    for (const el of deepFields()) {
      if (!fillable(el) || isChoice(el)) continue;
      const isSelect = el.tagName === "SELECT";
      if (!isSelect && el.value.trim()) continue;
      const field = fieldFor(el);
      let value = field ? valueFor(profile, field) : "";
      const label = humanLabel(el);
      if (!value) {
        const entry = matchAnswer(label, isSelect ? ["select", "text"] : ["text", "textarea"], answerList);
        if (entry) value = entry.value;
      }
      if (!value && learnedMap && label && learnedMap[label]) value = learnedMap[label];
      if (!value) continue;
      if (isSelect) {
        if (el.value) continue;
        if (fillSelect(el, value)) filled++;
      } else {
        setValue(el, value);
        filled++;
      }
    }
    return filled;
  }

  function choiceFieldFor(text) {
    for (const [field, needles] of Object.entries(CHOICE_MATCHERS)) {
      if (needles.some((n) => text.includes(n))) return field;
    }
    return null;
  }

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

  /** Select radio options and tick affirmative checkboxes. Precedence per group:
   *  profile field -> curated answer bank -> learned. Consent boxes are never
   *  auto-ticked. */
  function fillChoices(profile, learnedMap = learned, answerList = answers) {
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
      if (group.some((r) => r.checked)) continue;
      const question = group.map(groupQuestion).find(Boolean) || "";
      const field = choiceFieldFor(question);
      let answer = field ? (profile[field] ?? "").toLowerCase() : "";
      if (!answer) {
        const entry = matchAnswer(question, ["radio"], answerList);
        if (entry) answer = entry.value.toLowerCase();
      }
      if (!answer && learnedMap) {
        const k = norm(question);
        if (k && learnedMap[k]) answer = String(learnedMap[k]).toLowerCase();
      }
      if (!answer) continue;
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
      const context = `${optionLabel(el)} ${groupQuestion(el)}`;
      if (CONSENT_RE.test(context)) continue; // never auto-accept consent/terms
      const field = choiceFieldFor(context);
      const answer = (profile[field] ?? "").toLowerCase();
      let tick =
        field && answer === "yes" && /\byes\b|authorized|eligible/.test(optionLabel(el));
      if (!tick) {
        // Curated checkbox entry: only tick on an explicit affirmative value.
        const entry = matchAnswer(context, ["checkbox"], answerList);
        tick = Boolean(entry && AFFIRMATIVE_RE.test(entry.value.trim()));
      }
      if (tick) {
        el.checked = true;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        filled++;
      }
    }
    return filled;
  }

  function looksLikeApplicationForm() {
    const seen = new Set();
    for (const el of deepFields()) {
      if (!fillable(el)) continue;
      const field = fieldFor(el) || (isChoice(el) ? choiceFieldFor(groupQuestion(el)) : null);
      if (field) seen.add(field);
      if (seen.size >= 2) return true;
    }
    return false;
  }

  // --- Point to fields we couldn't fill so the user answers them (then learn) ---
  function clearHighlight(el) {
    if (el && el.dataset && el.dataset.saUnknown) {
      el.style.outline = "";
      el.style.outlineOffset = "";
      delete el.dataset.saUnknown;
    }
  }

  function highlightUnknown(el, scrollTo) {
    if (!el || el.dataset.saUnknown) return;
    el.dataset.saUnknown = "1";
    el.style.outline = "2px solid #f0a03a";
    el.style.outlineOffset = "1px";
    if (!el.title) el.title = "SmartApply couldn't fill this — type your answer and it'll be saved to your Hub for next time.";
    if (scrollTo) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  /**
   * Outline the empty fields we have no answer for (not in the profile, not
   * learned), so the user knows what to fill, and scroll to the first one.
   * Returns how many were flagged.
   */
  function markUnknowns(profile, learnedMap = learned) {
    let n = 0;
    for (const el of deepFields()) {
      if (!fillable(el) || isChoice(el)) continue;
      if (el.value && el.value.trim()) { clearHighlight(el); continue; }
      const field = fieldFor(el);
      let value = field ? valueFor(profile, field) : "";
      if (!value && learnedMap) {
        const k = humanLabel(el);
        if (k && learnedMap[k]) value = learnedMap[k];
      }
      if (value) { clearHighlight(el); continue; }
      if (!humanLabel(el)) continue; // nothing to learn it by
      highlightUnknown(el, n === 0); // scroll to the first unknown only
      n++;
    }
    return n;
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

  // --- Learn what you type on application forms ---
  async function remember(el) {
    if (!learningEnabled || !el || el.disabled || !extAlive()) return;
    if (!isAppPage) {
      if (looksLikeApplicationForm()) isAppPage = true;
      else return;
    }
    let key, val;
    if (el.tagName === "INPUT" && el.type === "radio") {
      if (!el.checked) return;
      key = norm(groupQuestion(el));
      val = optionLabel(el);
    } else if (el.tagName === "SELECT") {
      key = humanLabel(el);
      val = el.selectedOptions[0]?.text?.trim() || el.value;
    } else if (
      el.tagName === "TEXTAREA" ||
      (el.tagName === "INPUT" && !["password", "file", "hidden", "checkbox"].includes(el.type))
    ) {
      key = humanLabel(el);
      val = el.value;
    } else {
      return; // don't learn checkboxes (avoid auto-accepting consent later)
    }
    if (!key || !val) return;
    try {
      const { learned: cur = {} } = await chrome.storage.local.get("learned");
      if (cur[key] === val) { clearHighlight(el); return; }
      cur[key] = val;
      learned = cur;
      await chrome.storage.local.set({ learned: cur });
      clearHighlight(el); // it's answered now
      postLearnedToHub(key, val); // record it in the hub for next time
    } catch {
      // Extension reloaded/updated: this stale script can't reach storage. A
      // fresh content script is injected on the next page load — ignore.
    }
  }
  document.addEventListener("change", (e) => remember(e.target), true);
  // Clear the "fill me" highlight as soon as the user starts typing.
  document.addEventListener("input", (e) => { if (e.target?.value) clearHighlight(e.target); }, true);

  // Entry point the popup calls via chrome.scripting.executeScript. The popup
  // passes learned + answers explicitly (this freshly-injected script may not
  // have finished its async storage load yet).
  window.__smartApplyFill = (profile, learnedMap, answerList, submit) => {
    const l = learnedMap || learned;
    const a = answerList || answers;
    const filled = fillForm(profile, l, a) + fillChoices(profile, l, a);
    const unknown = markUnknowns(profile, l);
    return { filled, unknown, submitted: submit ? submitForm() : false };
  };

  // Keep cached state fresh. Ignore rejections (an orphaned script post-reload).
  chrome.storage.local.get(["learned", "answers", "hubUrl"]).then(({ learned: l, answers: a, hubUrl: h }) => {
    if (l) learned = l;
    if (Array.isArray(a)) answers = a;
    if (h) hubUrl = h;
  }).catch(() => {});
  chrome.storage.sync.get("settings").then(({ settings }) => {
    learningEnabled = settings?.learningEnabled ?? true;
  }).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.learned) learned = changes.learned.newValue || {};
    if (area === "local" && changes.hubUrl) hubUrl = changes.hubUrl.newValue || hubUrl;
    if (area === "local" && changes.answers) answers = changes.answers.newValue || [];
    if (area === "sync" && changes.settings) {
      learningEnabled = changes.settings.newValue?.learningEnabled ?? true;
    }
  });

  // --- Auto-fill when an application page opens ---
  (async function autoFillOnOpen() {
    let settings, profile, l, a, h;
    try {
      [{ settings, profile }, { learned: l, answers: a, hubUrl: h }] = await Promise.all([
        chrome.storage.sync.get(["settings", "profile"]),
        chrome.storage.local.get(["learned", "answers", "hubUrl"]),
      ]);
    } catch {
      return; // orphaned script (extension reloaded) — nothing to fill with
    }
    if (l) learned = l;
    if (Array.isArray(a)) answers = a;
    if (h) hubUrl = h;
    learningEnabled = settings?.learningEnabled ?? true;
    if (!(settings?.autofillOnOpen ?? true) || !profile) return;

    let done = false;
    const tryFill = () => {
      if (done) return;
      if (looksLikeApplicationForm()) {
        fillForm(profile);
        fillChoices(profile);
        markUnknowns(profile); // point to fields we couldn't fill
        done = true;
        observer.disconnect();
      }
    };
    const observer = new MutationObserver(() => tryFill());
    observer.observe(document.body, { childList: true, subtree: true });
    tryFill();
    setTimeout(() => observer.disconnect(), 20_000);
  })();
})();
