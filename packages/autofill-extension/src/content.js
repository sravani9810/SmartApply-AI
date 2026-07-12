// Content script: fills the visible application form with the saved profile,
// and optionally submits it. Self-contained (MV3 content scripts don't support
// ES module imports).

const FIELD_MATCHERS = {
  firstName: ["first name", "firstname", "given name"],
  lastName: ["last name", "lastname", "surname", "family name"],
  email: ["email", "e-mail"],
  phone: ["phone", "mobile", "tel"],
  linkedin: ["linkedin"],
  website: ["website", "portfolio"],
};

/** Best-effort label text for an input, drawn from its attributes and <label>. */
function fieldSignals(el) {
  const parts = [el.name, el.id, el.getAttribute("aria-label"), el.placeholder];
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label) parts.push(label.textContent);
  }
  return parts.filter(Boolean).join(" ").toLowerCase();
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

/** Fill matching inputs; returns the number of fields filled. */
function fillForm(profile) {
  const inputs = document.querySelectorAll("input, textarea");
  let filled = 0;
  for (const el of inputs) {
    if (el.type === "hidden" || el.disabled || el.readOnly) continue;
    const signals = fieldSignals(el);
    for (const [field, needles] of Object.entries(FIELD_MATCHERS)) {
      const value = profile[field];
      if (value && needles.some((n) => signals.includes(n))) {
        setValue(el, value);
        filled++;
        break;
      }
    }
  }
  return filled;
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

// Respond to popup / background requests.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "AUTOFILL") {
    const filled = fillForm(msg.profile);
    const submitted = msg.submit ? submitForm() : false;
    sendResponse({ filled, submitted });
  }
  return true;
});
