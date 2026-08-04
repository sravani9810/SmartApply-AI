// Functions injected into the page via chrome.scripting.executeScript.
//
// They are serialized to source and run in the page's world, so they must be
// entirely self-contained: no imports, no closure over module scope. They live
// here (rather than in popup.js) so the background worker can run them too —
// work started from the popup has to outlive the popup.

/** Tag every empty, visible, labelled field and return a descriptor for each. */
export function collectEmptyFields() {
  const out = [];
  let k = 0;
  const skip = ["hidden", "password", "file", "submit", "button", "checkbox", "radio", "email", "tel", "url"];
  const visible = (el) => el.offsetParent !== null || getComputedStyle(el).position === "fixed";
  const labelOf = (el) => {
    let l = el.getAttribute("aria-label") || "";
    if (!l && el.id) l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent || "";
    if (!l) l = el.closest("label")?.textContent || "";
    if (!l) l = el.placeholder || el.name || "";
    return l.replace(/\s+/g, " ").trim();
  };
  document.querySelectorAll("input, textarea, select").forEach((el) => {
    const tag = el.tagName.toLowerCase();
    if (el.disabled || el.readOnly) return;
    if (tag !== "select" && skip.includes((el.type || "").toLowerCase())) return;
    if (!visible(el)) return;
    if ((el.value || "").trim() !== "") return; // only empty fields
    const label = labelOf(el);
    if (!label) return;
    const key = "sa" + k++;
    el.setAttribute("data-sa-key", key);
    out.push({
      key, label,
      type: tag === "textarea" ? "textarea" : tag === "select" ? "select" : "text",
      options: tag === "select" ? [...el.options].map((o) => o.text.trim()).filter(Boolean) : undefined,
    });
  });
  return out;
}

/** Apply answers keyed by the data-sa-key stamped above. Returns fields filled. */
export function fillAnswers(byKey) {
  let filled = 0;
  const setVal = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  for (const [key, value] of Object.entries(byKey)) {
    if (!value) continue;
    const el = document.querySelector(`[data-sa-key="${key}"]`);
    if (!el) continue;
    if (el.tagName.toLowerCase() === "select") {
      const opt = [...el.options].find((o) => o.text.trim().toLowerCase() === String(value).toLowerCase());
      if (opt) { el.value = opt.value; el.dispatchEvent(new Event("change", { bubbles: true })); filled++; }
    } else if ((el.value || "").trim() === "") {
      setVal(el, value);
      filled++;
    }
  }
  return filled;
}
