# @smartapply/autofill-extension (Part 2)

A Chrome (Manifest V3) extension that auto-fills — and optionally submits — job
application forms using a saved applicant profile.

## How it works

- **`popup.html` / `popup.js`** — edit and save your profile (name, email,
  phone, LinkedIn, website) to `chrome.storage.sync`; buttons to **Fill** or
  **Fill & Submit** the form in the active tab.
- **`content.js`** — matches each form field by its name/id/label/placeholder
  against `FIELD_MATCHERS`, sets values in a way React/Vue controlled inputs
  detect, and can click the submit button.
- **`background.js`** — service worker that seeds an empty profile on install
  and relays autofill requests to the active tab.

## Load it (unpacked)

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select `packages/autofill-extension/src`.
3. Pin the extension, fill in your profile, open a job application, click
   **Fill** (or **Fill & Submit**).

No build step — the `src/` folder is the extension. `manifest.json` references
`background.js`, `content.js`, and `popup.html` by relative path.

## Extending

- Add fields: extend `DEFAULT_PROFILE` and `FIELD_MATCHERS` in `profile.js`
  (popup) and the mirrored `FIELD_MATCHERS` in `content.js`.
- Site-specific rules: branch on `location.hostname` in `content.js` for boards
  with non-standard forms (Workday, Greenhouse, Lever).
