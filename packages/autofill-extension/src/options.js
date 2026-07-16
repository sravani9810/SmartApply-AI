// Options page: edit the profile and the curated answer bank, and import/export
// the whole thing as answers.json. Storage helpers live in profile.js; the fill
// logic that consumes these lives in content.js.

import {
  PROFILE_FIELDS,
  loadProfile,
  saveProfile,
  loadAnswers,
  saveAnswers,
  toAnswerBank,
  fromAnswerBank,
} from "./profile.js";

const $ = (id) => document.getElementById(id);
const setStatus = (m) => ($("status").textContent = m);
const ANSWER_TYPES = ["text", "textarea", "select", "radio", "checkbox"];
const splitList = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
const newId = () =>
  crypto?.randomUUID?.() || `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/* ---------- profile ---------- */

const grid = $("profileGrid");
for (const f of PROFILE_FIELDS) {
  const wrap = document.createElement("div");
  wrap.className = "field" + (f.type === "textarea" ? " wide" : "");
  const label = document.createElement("label");
  label.textContent = f.label;
  const input =
    f.type === "textarea" ? document.createElement("textarea") : document.createElement("input");
  if (f.type && f.type !== "textarea") input.type = f.type;
  input.id = "p_" + f.key;
  wrap.append(label, input);
  grid.append(wrap);
}
const readProfile = () =>
  Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, $("p_" + f.key).value.trim()]));
const writeProfile = (p) =>
  PROFILE_FIELDS.forEach((f) => ($("p_" + f.key).value = p[f.key] ?? ""));

$("saveProfile").addEventListener("click", async () => {
  await saveProfile(readProfile());
  setStatus("Profile saved.");
});

/* ---------- answer bank ---------- */

let entries = [];
const answersEl = $("answers");

const afield = (labelText, el) => {
  const wrap = document.createElement("label");
  wrap.className = "afield";
  wrap.textContent = labelText;
  wrap.append(el);
  return wrap;
};

function bindInput(el, value, placeholder, onInput) {
  el.value = value;
  el.placeholder = placeholder;
  el.addEventListener("input", onInput);
  return el;
}

function renderEntry(e, i) {
  const card = document.createElement("div");
  card.className = "card";

  const q = bindInput(document.createElement("input"), e.question || "", "Question as it appears on forms", () => (entries[i].question = q.value));

  const type = document.createElement("select");
  for (const t of ANSWER_TYPES) {
    const o = document.createElement("option");
    o.value = t;
    o.textContent = t;
    if (t === e.type) o.selected = true;
    type.append(o);
  }
  type.addEventListener("change", () => (entries[i].type = type.value));

  const value = bindInput(document.createElement("input"), e.value || "", "Answer (or option text for select/radio)", () => (entries[i].value = value.value));
  const aliases = bindInput(document.createElement("input"), (e.aliases || []).join(", "), "Aliases, comma-separated", () => (entries[i].aliases = splitList(aliases.value)));
  const options = bindInput(document.createElement("input"), (e.options || []).join(", "), "Options for select/radio, comma-separated", () => (entries[i].options = splitList(options.value)));

  const del = document.createElement("button");
  del.className = "danger";
  del.textContent = "Delete";
  del.addEventListener("click", () => {
    entries.splice(i, 1);
    renderAnswers();
  });

  const top = document.createElement("div");
  top.className = "row2";
  top.append(afield("Question", q), afield("Type", type));
  const mid = document.createElement("div");
  mid.className = "row2";
  mid.append(afield("Answer / value", value), afield("Aliases", aliases));
  card.append(top, mid, afield("Options (select / radio)", options), del);
  return card;
}

function renderAnswers() {
  answersEl.innerHTML = "";
  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No answers yet. Add one, or import your answers.json.";
    answersEl.append(empty);
    return;
  }
  entries.forEach((e, i) => answersEl.append(renderEntry(e, i)));
}

// Drop rows missing a question or value; guarantee ids and array fields.
const cleanEntries = () =>
  entries
    .filter((e) => (e.question || "").trim() && (e.value || "").trim())
    .map((e) => ({
      id: e.id || newId(),
      question: e.question.trim(),
      aliases: e.aliases || [],
      type: e.type || "text",
      value: e.value,
      options: e.options || [],
    }));

$("addAnswer").addEventListener("click", () => {
  entries.push({ id: newId(), question: "", aliases: [], type: "text", value: "", options: [] });
  renderAnswers();
});

$("saveAnswers").addEventListener("click", async () => {
  entries = cleanEntries();
  await saveAnswers(entries);
  renderAnswers();
  setStatus(`Saved ${entries.length} answer(s).`);
});

/* ---------- import / export ---------- */

$("exportBank").addEventListener("click", () => {
  const bank = toAnswerBank(readProfile(), cleanEntries());
  const blob = new Blob([JSON.stringify(bank, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "answers.json";
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus("Exported answers.json — save it into your repo's data/ folder.");
});

$("importBank").addEventListener("change", async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  try {
    const { profile, answers } = fromAnswerBank(await file.text());
    const hasProfile = profile && Object.keys(profile).length > 0;
    if (hasProfile) {
      writeProfile({ ...readProfile(), ...profile });
      await saveProfile(readProfile());
    }
    entries = answers.map((e) => ({ id: newId(), aliases: [], options: [], type: "text", ...e }));
    entries = cleanEntries();
    await saveAnswers(entries);
    renderAnswers();
    setStatus(`Imported ${entries.length} answer(s)${hasProfile ? " + profile" : ""}.`);
  } catch (err) {
    setStatus("Import failed: " + err.message);
  } finally {
    ev.target.value = ""; // allow re-importing the same file
  }
});

/* ---------- init ---------- */

(async () => {
  writeProfile(await loadProfile());
  entries = await loadAnswers();
  renderAnswers();
})();
