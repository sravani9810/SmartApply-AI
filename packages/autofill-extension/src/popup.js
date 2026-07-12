import { DEFAULT_PROFILE, loadProfile, saveProfile } from "./profile.js";

const FIELDS = Object.keys(DEFAULT_PROFILE);
const status = document.getElementById("status");

function readForm() {
  const profile = {};
  for (const f of FIELDS) profile[f] = document.getElementById(f).value.trim();
  return profile;
}

function writeForm(profile) {
  for (const f of FIELDS) document.getElementById(f).value = profile[f] ?? "";
}

async function autofill(submit) {
  await saveProfile(readForm());
  const res = await chrome.runtime.sendMessage({ type: "AUTOFILL_ACTIVE_TAB", submit });
  status.textContent = res
    ? `Filled ${res.filled} field(s)${res.submitted ? ", submitted" : ""}.`
    : "No response from page.";
}

document.getElementById("save").addEventListener("click", async () => {
  await saveProfile(readForm());
  status.textContent = "Saved.";
});
document.getElementById("fill").addEventListener("click", () => autofill(false));
document.getElementById("fillSubmit").addEventListener("click", () => autofill(true));

loadProfile().then(writeForm);
