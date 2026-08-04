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

  // ===========================================================================
  // Agentic primitives — used by the Auto-pilot loop in the background worker.
  // These only OBSERVE and FILL/NAVIGATE; they never click a submit control.
  // Everything is tagged with data-sa-* attributes so the loop can address the
  // exact element across executeScript round-trips.
  // ===========================================================================

  const isRequired = (el) =>
    el.required || el.getAttribute("aria-required") === "true" ||
    !!el.closest("[aria-required='true']");

  const isFilled = (el) => {
    if (el.tagName === "SELECT") {
      const o = el.selectedOptions[0];
      return !!(el.value && el.value.trim()) && !(o && /select|choose|^--/i.test(o.text.trim()));
    }
    if (isChoice(el)) return false; // handled at group level
    return !!(el.value && el.value.trim());
  };

  /**
   * Snapshot every fillable field on the page (text/textarea/select + radio
   * groups + checkboxes), tagging each with a stable data-sa-key so answers can
   * be applied back later. Radio options are collapsed into a single entry.
   */
  function snapshotFields() {
    const out = [];
    const radioGroups = new Map(); // groupKey -> { els, question }
    let k = 0;

    for (const el of deepFields()) {
      if (!fillable(el)) continue;

      if (el.type === "radio") {
        const gk = el.name || groupQuestion(el) || `__r${radioGroups.size}`;
        if (!radioGroups.has(gk)) radioGroups.set(gk, { els: [], question: "" });
        const g = radioGroups.get(gk);
        g.els.push(el);
        g.question = g.question || groupQuestion(el);
        continue;
      }

      if (el.type === "checkbox") {
        const context = `${optionLabel(el)} ${groupQuestion(el)}`;
        const key = `sa${k++}`;
        el.setAttribute("data-sa-key", key);
        out.push({
          key, type: "checkbox",
          label: humanLabel(el) || optionLabel(el) || groupQuestion(el),
          required: isRequired(el), filled: el.checked, consent: CONSENT_RE.test(context),
        });
        continue;
      }

      const label = humanLabel(el);
      if (!label && el.tagName !== "SELECT") continue;
      const key = `sa${k++}`;
      el.setAttribute("data-sa-key", key);
      out.push({
        key,
        type: el.tagName === "TEXTAREA" ? "textarea" : el.tagName === "SELECT" ? "select" : "text",
        label: label || el.name || el.id,
        required: isRequired(el),
        filled: isFilled(el),
        options: el.tagName === "SELECT"
          ? [...el.options].map((o) => o.text.trim()).filter((t) => t && !/^--|select|choose/i.test(t))
          : undefined,
      });
    }

    let gi = 0;
    for (const [, g] of radioGroups) {
      const key = `sar${gi++}`;
      g.els.forEach((el) => el.setAttribute("data-sa-key", key));
      out.push({
        key, type: "radio",
        label: norm(g.question) || humanLabel(g.els[0]) || "choice",
        required: g.els.some(isRequired),
        filled: g.els.some((r) => r.checked),
        options: g.els.map(optionLabel).filter(Boolean),
      });
    }
    return out;
  }

  const CLICK_SUBMIT_RE = /\b(submit|apply now|submit application|send application|finish|complete)\b/i;
  const CLICK_NEXT_RE = /\b(next|continue|save and continue|save & continue|proceed|review|go to next)\b/i;

  function clickable() {
    const nodes = [
      ...document.querySelectorAll("button, input[type=submit], input[type=button], [role=button]"),
    ];
    return nodes.filter((b) => !b.disabled && b.offsetParent !== null);
  }

  const btnText = (b) => (b.innerText || b.value || b.getAttribute("aria-label") || "").trim();

  /**
   * Classify the page's action buttons. Tags the chosen "next" button with
   * data-sa-next so __smartApplyNext can click the exact one. Never tags submit.
   */
  function detectButtons() {
    let hasSubmit = false, hasNext = false, nextTagged = false;
    // Iterate bottom-up so the last (usually primary) next button wins the tag.
    const btns = clickable();
    for (const b of btns) delete b.dataset.saNext;
    for (const b of [...btns].reverse()) {
      const t = btnText(b);
      if (!t) continue;
      if (CLICK_SUBMIT_RE.test(t) && !CLICK_NEXT_RE.test(t)) { hasSubmit = true; continue; }
      if (CLICK_NEXT_RE.test(t)) {
        hasNext = true;
        if (!nextTagged) { b.setAttribute("data-sa-next", "1"); nextTagged = true; }
      }
    }
    return { hasNext, hasSubmit };
  }

  window.__smartApplyObserve = () => {
    const fields = snapshotFields();
    const buttons = detectButtons();
    const requiredEmpty = fields.filter((f) => f.required && !f.filled && !f.consent).length;
    return {
      url: location.href,
      isForm: looksLikeApplicationForm(),
      step: (document.querySelector("[aria-current='step'], .step.active, [class*='step'][class*='active']")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
      fields,
      requiredEmpty,
      ...buttons,
    };
  };

  /** Apply reasoned answers addressed by data-sa-key (text/select/radio/checkbox). */
  window.__smartApplyApply = (byKey) => {
    let filled = 0;
    for (const [key, value] of Object.entries(byKey || {})) {
      if (value === "" || value == null) continue;
      const els = [...document.querySelectorAll(`[data-sa-key="${CSS.escape(key)}"]`)];
      // shadow DOM elements won't match a document query — fall back to a deep scan.
      const targets = els.length ? els : deepFields().filter((e) => e.getAttribute?.("data-sa-key") === key);
      if (!targets.length) continue;
      const first = targets[0];

      if (first.type === "radio") {
        const v = String(value).toLowerCase();
        const pick = targets.find((r) => {
          const opt = optionLabel(r);
          return opt && (opt.includes(v) || v.includes(opt));
        });
        if (pick && !pick.checked) {
          pick.checked = true;
          pick.dispatchEvent(new Event("change", { bubbles: true }));
          filled++;
        }
      } else if (first.type === "checkbox") {
        const yes = /^(yes|true|1|checked|agree|i agree)$/i.test(String(value).trim());
        if (yes && !first.checked) {
          first.checked = true;
          first.dispatchEvent(new Event("change", { bubbles: true }));
          filled++;
        }
      } else if (first.tagName === "SELECT") {
        if (!first.value && fillSelect(first, String(value))) filled++;
      } else if (!(first.value && first.value.trim())) {
        setValue(first, String(value));
        filled++;
      }
    }
    return filled;
  };

  /** Click the "next / continue" button (never a submit). Returns whether it clicked. */
  window.__smartApplyNext = () => {
    detectButtons(); // (re)tag the current next button
    const btn = clickable().find((b) => b.dataset?.saNext === "1");
    if (btn) { btn.click(); return true; }
    return false;
  };

  // ===========================================================================
  // Repeatable sections — "Add experience" / "Add education" that spawn rows.
  // The agent asks how many rows exist, clicks Add until they match the résumé,
  // then fills each row scoped to its own container (so row 2's Company gets
  // experience #2, not #1). Row fields are matched within-row, not globally.
  // ===========================================================================

  const ROW_MATCHERS = {
    experience: {
      company: ["company", "employer", "organization", "organisation"],
      title: ["title", "position", "role", "job title"],
      location: ["location", "city"],
      start: ["start date", "date from", "from", "start", "began"],
      end: ["end date", "date to", "to date", "until", "end", "present"],
      description: ["description", "responsibilit", "duties", "achievement", "what you did", "summary"],
    },
    education: {
      university: ["school", "university", "college", "institution"],
      degree: ["degree", "qualification"],
      field: ["field of study", "major", "discipline", "field"],
      location: ["location", "city"],
      start: ["start date", "date from", "from", "start"],
      end: ["end date", "date to", "graduation", "until", "end", "to"],
      description: ["description", "activities", "achievement"],
    },
  };

  const ADD_RE = {
    experience: /add\s+(another\s+|more\s+|an?\s+)?(work\s+|employment\s+|professional\s+)?(experience|employment|work history|position|role|job)/i,
    education: /add\s+(another\s+|more\s+|an?\s+)?(education|school|degree|university|qualification)/i,
  };

  /** input/textarea/select within a node, including open shadow roots. */
  function fieldsIn(node) {
    const out = [];
    const walk = (n) => {
      if (!n.querySelectorAll) return;
      out.push(...n.querySelectorAll("input, textarea, select"));
      for (const el of n.querySelectorAll("*")) if (el.shadowRoot) walk(el.shadowRoot);
    };
    walk(node);
    return out;
  }

  const rowFieldKey = (el, matchers) => {
    const sig = fieldSignals(el);
    for (const [key, needles] of Object.entries(matchers)) {
      if (needles.some((n) => sig.includes(n))) return key;
    }
    return null;
  };

  /** Walk up from an anchor field to the smallest container that also holds a sibling field. */
  function rowContainerOf(el, siblingNeedles) {
    let node = el.parentElement;
    for (let depth = 0; node && node !== document.body && depth < 8; depth++) {
      const has = fieldsIn(node).some((f) => f !== el && siblingNeedles.some((n) => fieldSignals(f).includes(n)));
      if (has) return node;
      node = node.parentElement;
    }
    return el.closest("fieldset, li, [class*='row'], [class*='entry'], [class*='item']") || el.parentElement;
  }

  /** Distinct row containers currently rendered for a repeatable section. */
  function rowsFor(kind) {
    const m = ROW_MATCHERS[kind];
    const anchorNeedles = kind === "experience" ? m.company : m.university;
    const siblingNeedles = kind === "experience" ? m.title : m.degree;
    const anchors = deepFields().filter(
      (el) => fillable(el) && !isChoice(el) && anchorNeedles.some((n) => fieldSignals(el).includes(n)),
    );
    const rows = [];
    for (const a of anchors) {
      const c = rowContainerOf(a, siblingNeedles);
      if (c && !rows.includes(c)) rows.push(c);
    }
    return rows;
  }

  function findAddButton(kind) {
    const re = ADD_RE[kind];
    const nodes = [...document.querySelectorAll("button, a, [role=button], input[type=button]")];
    return nodes.find((b) => !b.disabled && b.offsetParent !== null && re.test(btnText(b))) || null;
  }

  function rowValue(entry, key, kind) {
    if (kind === "experience") {
      if (key === "description") return (entry.bullets || []).join("\n");
      return entry[key] || "";
    }
    if (key === "description") return (entry.description || []).join("\n");
    return entry[key] || "";
  }

  function fillRow(container, entry, kind) {
    const m = ROW_MATCHERS[kind];
    let filled = 0;
    for (const el of fieldsIn(container)) {
      if (!fillable(el) || isChoice(el)) continue;
      if (el.value && el.value.trim()) continue; // only empty
      const key = rowFieldKey(el, m);
      if (!key) continue;
      const val = rowValue(entry, key, kind);
      if (!val) continue;
      if (el.tagName === "SELECT") { if (fillSelect(el, String(val))) filled++; }
      else { setValue(el, String(val)); filled++; }
    }
    return filled;
  }

  /** How many rows exist + whether an Add button is present, per section kind. */
  window.__smartApplyRepeatInfo = () => {
    const info = {};
    for (const kind of ["experience", "education"]) {
      const btn = findAddButton(kind);
      if (btn) btn.setAttribute("data-sa-add", kind);
      info[kind] = { rows: rowsFor(kind).length, hasAdd: !!btn };
    }
    return info;
  };

  /** Click the "Add <kind>" button to spawn a new row. Returns whether it clicked. */
  window.__smartApplyAddRow = (kind) => {
    const btn =
      [...document.querySelectorAll("[data-sa-add]")].find((b) => b.dataset.saAdd === kind) ||
      findAddButton(kind);
    if (btn) { btn.click(); return true; }
    return false;
  };

  /** Fill each rendered row with the matching résumé entry (row i ← entries[i]). */
  window.__smartApplyFillRows = (kind, entries) => {
    const rows = rowsFor(kind);
    let filled = 0, used = 0;
    for (let i = 0; i < rows.length && i < (entries || []).length; i++) {
      const n = fillRow(rows[i], entries[i], kind);
      filled += n;
      if (n) used++;
    }
    return { filled, rows: rows.length, used };
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
