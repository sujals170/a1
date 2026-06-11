const CUSTOM_WORDS_KEY = "customEnglishWords";
const SHARED_WORDS_PATH = "customEnglishWords";

const loginPanel = document.getElementById("loginPanel");
const wordPanel = document.getElementById("wordPanel");
const loginForm = document.getElementById("loginForm");
const wordForm = document.getElementById("wordForm");
const loginStatus = document.getElementById("loginStatus");
const wordStatus = document.getElementById("wordStatus");
const logoutBtn = document.getElementById("logoutBtn");
const clearFormBtn = document.getElementById("clearFormBtn");
const fetchWordBtn = document.getElementById("fetchWordBtn");
const fetchWordStatus = document.getElementById("fetchWordStatus");
const customWordList = document.getElementById("customWordList");
const customCount = document.getElementById("customCount");
const sectionListEl = document.getElementById("sectionList");
const sectionCountEl = document.getElementById("sectionCount");
const createSectionBtn = document.getElementById("createSectionBtn");
const sectionStatus = document.getElementById("sectionStatus");
const activeSectionBadge = document.getElementById("activeSectionBadge");
const confirmModal = document.getElementById("confirmModal");
const confirmTitleEl = document.getElementById("confirmTitle");
const confirmMessageEl = document.getElementById("confirmMessage");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");
const confirmActionBtn = document.getElementById("confirmActionBtn");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const DICTIONARY_API_BASE = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const TRANSLATION_API_BASE = "https://api.mymemory.translated.net/get";
const LOCAL_WORD_DATA_FILES = ["word.json", "cambridge.json"];
const PART_OF_SPEECH_OPTIONS = new Set([
  "phrase",
  "noun",
  "verb",
  "adjective",
  "adverb",
  "preposition",
  "pronoun",
  "conjunction",
  "modal",
  "determiner",
  "exclamation",
  "number",
  "article"
]);
const PART_OF_SPEECH_ALIASES = {
  n: "noun",
  noun: "noun",
  v: "verb",
  verb: "verb",
  adj: "adjective",
  adjective: "adjective",
  adv: "adverb",
  adverb: "adverb",
  prep: "preposition",
  preposition: "preposition",
  pron: "pronoun",
  pronoun: "pronoun",
  conj: "conjunction",
  conjunction: "conjunction",
  modal: "modal",
  det: "determiner",
  determiner: "determiner",
  excl: "exclamation",
  exclamation: "exclamation",
  interjection: "exclamation",
  num: "number",
  numeral: "number",
  number: "number",
  article: "article",
  phrase: "phrase"
};

const fields = {
  word: document.getElementById("wordInput"),
  level: document.getElementById("levelInput"),
  sectionName: document.getElementById("sectionNameInput"),
  part_of_speech: document.getElementById("posInput"),
  english_meaning: document.getElementById("meaningInput"),
  gujarati: document.getElementById("gujaratiInput"),
  example_sentence: document.getElementById("exampleInput"),
  synonyms: document.getElementById("synonymsInput"),
  antonyms: document.getElementById("antonymsInput")
};
const SECTION_STORAGE_KEY = "customEnglishSections";
let sections = loadSections();
let activeSectionName = "";
let pendingConfirmResolve = null;

function getFirebaseApp() {
  try {
    if (typeof firebase === "undefined") return null;
    const cfg = window.APP_CONFIG && window.APP_CONFIG.firebase;
    if (!cfg || !cfg.apiKey) return null;
    return firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg);
  } catch (error) {
    return null;
  }
}

function getFirebaseAuth() {
  try {
    const app = getFirebaseApp();
    if (!app) return null;
    return firebase.auth();
  } catch (error) {
    return null;
  }
}

function getFirebaseDb() {
  try {
    const app = getFirebaseApp();
    if (!app || !app.options.databaseURL) return null;
    return firebase.database();
  } catch (error) {
    return null;
  }
}

const firebaseAuth = getFirebaseAuth();

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeList(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeLookupText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizePartOfSpeech(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
  if (PART_OF_SPEECH_ALIASES[normalized]) return PART_OF_SPEECH_ALIASES[normalized];
  const compact = normalized.replace(/[^a-z]+/g, "");
  if (PART_OF_SPEECH_ALIASES[compact]) return PART_OF_SPEECH_ALIASES[compact];
  if (PART_OF_SPEECH_OPTIONS.has(normalized)) return normalized;
  return "";
}

function normalizePartOfSpeechList(value) {
  return String(value || "")
    .split(/[,/;&|]+/g)
    .map((entry) => normalizePartOfSpeech(entry))
    .filter(Boolean);
}

function validatePartOfSpeechInput(value) {
  const rawParts = String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!rawParts.length) {
    return { ok: false, message: "Please enter at least one part of speech." };
  }

  const normalizedParts = [];
  for (const part of rawParts) {
    const normalized = normalizePartOfSpeech(part);
    if (!normalized) {
      return {
        ok: false,
        message: `Invalid part of speech: "${part}". Use values like noun, verb, adjective, adverb, preposition, pronoun, conjunction, modal, determiner, exclamation, number, article, or phrase.`
      };
    }
    normalizedParts.push(normalized);
  }

  return { ok: true, value: normalizedParts.join(", ") };
}

function setFieldIfEmpty(field, value) {
  const nextValue = Array.isArray(value) ? value.join(", ") : String(value || "").trim();
  if (!field || !nextValue || field.value.trim()) return;
  field.value = nextValue;
}

function findBestDefinition(entries) {
  for (const entry of entries) {
    const meanings = Array.isArray(entry.meanings) ? entry.meanings : [];
    for (const meaning of meanings) {
      const definitions = Array.isArray(meaning.definitions) ? meaning.definitions : [];
      const withExample = definitions.find((definition) => definition && definition.definition && definition.example);
      const fallback = definitions.find((definition) => definition && definition.definition);
      const selected = withExample || fallback;
      if (selected) {
        return { meaning, definition: selected };
      }
    }
  }
  return null;
}

async function translateToGujarati(text) {
  const sourceText = String(text || "").trim();
  if (!sourceText) return "";

  const url = `${TRANSLATION_API_BASE}?q=${encodeURIComponent(sourceText)}&langpair=en|gu`;
  const response = await fetch(url);
  if (!response.ok) return "";
  const data = await response.json();
  return String(data && data.responseData && data.responseData.translatedText || "").trim();
}

async function findKnownGujaratiMeaning(word) {
  const target = normalizeLookupText(word);
  if (!target) return "";

  for (const fileName of LOCAL_WORD_DATA_FILES) {
    try {
      const response = await fetch(fileName);
      if (!response.ok) continue;
      const data = await response.json();
      const levels = data && data.levels ? data.levels : {};
      for (const entries of Object.values(levels)) {
        if (!Array.isArray(entries)) continue;
        const match = entries.find((entry) => normalizeLookupText(entry && entry.word) === target);
        if (match && String(match.gujarati || "").trim()) {
          return String(match.gujarati).trim();
        }
      }
    } catch (error) {
    }
  }

  return "";
}

function isUsefulGujarati(value, originalWord) {
  const translated = String(value || "").trim();
  if (!translated) return false;
  return normalizeLookupText(translated) !== normalizeLookupText(originalWord);
}

async function fetchWordDetails() {
  const word = fields.word.value.trim();
  if (!word) {
    fetchWordStatus.textContent = "Enter a word first.";
    fields.word.focus();
    return;
  }

  fetchWordBtn.disabled = true;
  fetchWordStatus.textContent = "Fetching...";

  try {
    const response = await fetch(`${DICTIONARY_API_BASE}${encodeURIComponent(word)}`);
    if (!response.ok) throw new Error("No details found.");
    const data = await response.json();
    const entries = Array.isArray(data) ? data : [];
    const selected = findBestDefinition(entries);
    if (!selected) throw new Error("No usable meaning found.");

    const posList = normalizePartOfSpeechList(selected.meaning.partOfSpeech);
    if (posList.length) {
      fields.part_of_speech.value = posList.join(", ");
    }

    const definitionText = selected.definition.definition;
    setFieldIfEmpty(fields.english_meaning, definitionText);
    setFieldIfEmpty(fields.example_sentence, selected.definition.example);
    setFieldIfEmpty(fields.synonyms, [
      ...(Array.isArray(selected.definition.synonyms) ? selected.definition.synonyms : []),
      ...(Array.isArray(selected.meaning.synonyms) ? selected.meaning.synonyms : [])
    ].slice(0, 8));
    setFieldIfEmpty(fields.antonyms, [
      ...(Array.isArray(selected.definition.antonyms) ? selected.definition.antonyms : []),
      ...(Array.isArray(selected.meaning.antonyms) ? selected.meaning.antonyms : [])
    ].slice(0, 8));

    if (!fields.gujarati.value.trim()) {
      const knownGujarati = await findKnownGujaratiMeaning(word);
      if (knownGujarati) {
        setFieldIfEmpty(fields.gujarati, knownGujarati);
      }
    }

    if (!fields.gujarati.value.trim()) {
      const wordGujarati = await translateToGujarati(word);
      if (isUsefulGujarati(wordGujarati, word)) {
        setFieldIfEmpty(fields.gujarati, wordGujarati);
      }
    }

    if (!fields.gujarati.value.trim()) {
      const gujaratiMeaning = await translateToGujarati(definitionText);
      if (isUsefulGujarati(gujaratiMeaning, word)) {
        setFieldIfEmpty(fields.gujarati, gujaratiMeaning);
      }
    }

    const missing = [];
    if (!fields.example_sentence.value.trim()) missing.push("example");
    if (!fields.gujarati.value.trim()) missing.push("Gujarati");
    fetchWordStatus.textContent = missing.length
      ? `Details added. Missing: ${missing.join(", ")}.`
      : "Details added.";
  } catch (error) {
    fetchWordStatus.textContent = error.message || "Could not fetch details.";
  } finally {
    fetchWordBtn.disabled = false;
  }
}

function loadCustomWords() {
  try {
    const raw = localStorage.getItem(CUSTOM_WORDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveLocalCustomWords(words) {
  localStorage.setItem(CUSTOM_WORDS_KEY, JSON.stringify(words));
}

function getSharedKey(entry) {
  return makeWordId(entry)
    .replace(/[\.\#\$\[\]\/]/g, "-")
    .replace(/[^a-z0-9|_-]/g, "-")
    .slice(0, 180);
}

function normalizeSharedWords(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === "object") return Object.values(value).filter(Boolean);
  return [];
}

function closeConfirmModal(result = false) {
  if (!confirmModal) return;
  confirmModal.hidden = true;
  confirmModal.setAttribute("aria-hidden", "true");
  if (pendingConfirmResolve) {
    const resolve = pendingConfirmResolve;
    pendingConfirmResolve = null;
    resolve(Boolean(result));
  }
}

function openConfirmModal(options = {}) {
  if (!confirmModal || !confirmTitleEl || !confirmMessageEl || !confirmActionBtn) {
    return Promise.resolve(false);
  }

  const title = String(options.title || "Confirm action");
  const message = String(options.message || "Are you sure you want to continue?");
  const actionLabel = String(options.actionLabel || "Delete");

  confirmTitleEl.textContent = title;
  confirmMessageEl.textContent = message;
  confirmActionBtn.textContent = actionLabel;
  confirmModal.hidden = false;
  confirmModal.setAttribute("aria-hidden", "false");
  try {
    confirmCancelBtn && confirmCancelBtn.focus({ preventScroll: true });
  } catch {
    if (confirmCancelBtn) confirmCancelBtn.focus();
  }

  return new Promise((resolve) => {
    pendingConfirmResolve = resolve;
  });
}

function loadSections() {
  try {
    const raw = localStorage.getItem(SECTION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
  } catch (error) {
    return [];
  }
}

function saveSections(nextSections) {
  sections = Array.isArray(nextSections)
    ? nextSections.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(sections));
}

async function loadVisibleWords() {
  const db = getFirebaseDb();
  if (!db) return loadCustomWords();

  try {
    const snap = await db.ref(SHARED_WORDS_PATH).once("value");
    const sharedWords = normalizeSharedWords(snap.val());
    localStorage.setItem(CUSTOM_WORDS_KEY, JSON.stringify(sharedWords));
    return sharedWords;
  } catch (error) {
    return loadCustomWords();
  }
}

async function saveCustomWords(words) {
  saveLocalCustomWords(words);
  const db = getFirebaseDb();
  if (!db) return false;

  const byId = words.reduce((result, entry) => {
    const key = getSharedKey(entry);
    if (key) result[key] = entry;
    return result;
  }, {});

  await db.ref(SHARED_WORDS_PATH).set(byId);
  return true;
}

function setLoggedIn(isLoggedIn) {
  loginPanel.hidden = isLoggedIn;
  wordPanel.hidden = !isLoggedIn;
  if (isLoggedIn) {
    renderCustomWords();
    renderSections();
    updateSectionCreationUI();
  } else {
    resetSectionCreation();
  }
}

function makeWordId(entry) {
  return [
    entry.level || "",
    entry.word || "",
    entry.part_of_speech || "",
    entry.english_meaning || ""
  ].join("|").toLowerCase();
}

function getFormEntry() {
  const validatedPos = validatePartOfSpeechInput(fields.part_of_speech.value);
  return {
    word: fields.word.value.trim(),
    level: activeSectionName,
    part_of_speech: validatedPos.ok ? validatedPos.value : "",
    english_meaning: fields.english_meaning.value.trim(),
    gujarati: fields.gujarati.value.trim(),
    example_sentence: fields.example_sentence.value.trim(),
    synonyms: normalizeList(fields.synonyms.value),
    antonyms: normalizeList(fields.antonyms.value),
    created_at: new Date().toISOString()
  };
}

function clearWordForm() {
  wordForm.reset();
  fields.part_of_speech.value = "";
  fields.part_of_speech.setCustomValidity("");
  fields.level.value = activeSectionName || "Custom";
  fields.word.focus();
}

function updateSectionNameField() {
  const sectionName = fields.sectionName.value.trim();
  createSectionBtn.disabled = !sectionName;
}

function updateSectionCreationUI() {
  const hasSection = Boolean(activeSectionName);
  wordForm.hidden = !hasSection;
  if (activeSectionBadge) {
    activeSectionBadge.textContent = hasSection ? activeSectionName : "No section selected";
  }
  if (fields.level) {
    fields.level.value = hasSection ? activeSectionName : "Custom";
  }
  if (sectionStatus) {
    sectionStatus.textContent = hasSection ? `Active section: ${activeSectionName}. Add words below.` : "";
  }
}

function resetSectionCreation() {
  activeSectionName = "";
  if (fields.sectionName) fields.sectionName.value = "";
  if (fields.level) fields.level.value = "Custom";
  if (activeSectionBadge) activeSectionBadge.textContent = "No section selected";
  if (sectionStatus) sectionStatus.textContent = "";
  if (wordForm) wordForm.hidden = true;
  updateSectionNameField();
}

function createSection() {
  const sectionName = fields.sectionName.value.trim();
  if (!sectionName) {
    if (sectionStatus) sectionStatus.textContent = "Enter a section name first.";
    fields.sectionName.focus();
    return;
  }

  if (sections.some((item) => item.toLowerCase() === sectionName.toLowerCase())) {
    if (sectionStatus) sectionStatus.textContent = "That section already exists.";
    return;
  }

  saveSections([...sections, sectionName]);
  renderSections();
  fields.sectionName.value = "";
  updateSectionNameField();
  if (sectionStatus) sectionStatus.textContent = `Section saved: ${sectionName}.`;
}

function activateSection(sectionName) {
  activeSectionName = String(sectionName || "").trim();
  if (!activeSectionName) return;
  if (fields.level) fields.level.value = activeSectionName;
  if (wordForm) wordForm.hidden = false;
  if (sectionStatus) sectionStatus.textContent = `Active section: ${activeSectionName}. Add words below.`;
  if (activeSectionBadge) activeSectionBadge.textContent = activeSectionName;
  renderSections();
  fields.word.focus();
}

async function deleteSection(sectionName) {
  const target = String(sectionName || "").trim();
  if (!target) return;

  const confirmDelete = await openConfirmModal({
    title: "Delete section?",
    message: `Delete the section "${target}" and all words inside it?`,
    actionLabel: "Delete"
  });
  if (!confirmDelete) return;

  const nextSections = sections.filter((item) => item.toLowerCase() !== target.toLowerCase());
  saveSections(nextSections);

  const words = await loadVisibleWords();
  const filteredWords = words.filter((entry) => String(entry.level || "").trim().toLowerCase() !== target.toLowerCase());
  const savedShared = await saveCustomWords(filteredWords);

  if (activeSectionName.toLowerCase() === target.toLowerCase()) {
    resetSectionCreation();
  } else {
    renderSections();
    updateSectionCreationUI();
  }

  await renderCustomWords();
  if (sectionStatus) {
    sectionStatus.textContent = savedShared
      ? `Section deleted: ${target}.`
      : `Section deleted locally: ${target}.`;
  }
}

function renderSections() {
  if (sectionCountEl) {
    sectionCountEl.textContent = `${sections.length} section${sections.length === 1 ? "" : "s"}`;
  }

  if (!sectionListEl) return;

  if (!sections.length) {
    sectionListEl.innerHTML = '<div class="admin-empty">No sections created yet.</div>';
    return;
  }

  sectionListEl.innerHTML = sections.map((sectionName, index) => `
    <article class="admin-section-item${sectionName === activeSectionName ? " is-active" : ""}">
      <div>
        <div class="admin-word-title">
          <strong>${escapeHtml(sectionName)}</strong>
          <span class="level-tag">${sectionName === activeSectionName ? "Active" : "Saved"}</span>
        </div>
      </div>
      <div class="admin-section-actions">
        <button class="quiz-btn quiz-btn-primary admin-enter-btn" type="button" data-section="${escapeHtml(sectionName)}">Enter</button>
        <button class="quiz-btn quiz-btn-ghost admin-delete-section-btn" type="button" data-section="${escapeHtml(sectionName)}">Delete</button>
      </div>
    </article>
  `).join("");
}

async function renderCustomWords() {
  const words = await loadVisibleWords();
  customCount.textContent = `${words.length} word${words.length === 1 ? "" : "s"}`;

  if (!words.length) {
    customWordList.innerHTML = '<div class="admin-empty">No custom words yet.</div>';
    return;
  }

  customWordList.innerHTML = words.map((entry, index) => `
    <article class="admin-word-item">
      <div>
        <div class="admin-word-title">
          <strong>${escapeHtml(entry.word)}</strong>
          <span class="level-tag">${escapeHtml(entry.level || "Custom")}</span>
          <span class="pos">${escapeHtml(entry.part_of_speech)}</span>
        </div>
        <p class="meaning">${escapeHtml(entry.english_meaning)}</p>
        ${entry.gujarati ? `<p class="gujarati">${escapeHtml(entry.gujarati)}</p>` : ""}
        ${entry.example_sentence ? `<p class="example">${escapeHtml(entry.example_sentence)}</p>` : ""}
      </div>
      <button class="quiz-btn quiz-btn-ghost admin-delete-btn" type="button" data-index="${index}">Delete</button>
    </article>
  `).join("");
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!firebaseAuth) {
    loginStatus.textContent = "Sign-in is currently unavailable. Please try again later.";
    return;
  }

  const email = emailInput ? emailInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value : "";
  if (!email || !password) {
    loginStatus.textContent = "Please enter both email and password.";
    return;
  }

  loginStatus.textContent = "Signing in...";

  try {
    await firebaseAuth.signInWithEmailAndPassword(email, password);
    loginStatus.textContent = "";
  } catch (error) {
    const code = String(error && error.code || "");
    if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") {
      loginStatus.textContent = "Email or password is incorrect. Please try again.";
    } else if (code === "auth/too-many-requests") {
      loginStatus.textContent = "Too many attempts. Please wait a moment and try again.";
    } else if (code === "auth/network-request-failed") {
      loginStatus.textContent = "Network error. Check your connection and try again.";
    } else {
      loginStatus.textContent = "Sign-in failed. Please check your details and try again.";
    }
  }
});

wordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const entry = getFormEntry();
  const posValidation = validatePartOfSpeechInput(fields.part_of_speech.value);

  if (!activeSectionName) {
    wordStatus.textContent = "Click Enter on a section first.";
    return;
  }

  if (!posValidation.ok) {
    wordStatus.textContent = posValidation.message;
    fields.part_of_speech.focus();
    return;
  }

  entry.part_of_speech = posValidation.value;
  entry.level = activeSectionName;

  if (!entry.word || !entry.part_of_speech || !entry.english_meaning || !entry.gujarati || !entry.example_sentence) {
    wordStatus.textContent = "Please fill in the required fields: word, part of speech, meaning, Gujarati, and example.";
    return;
  }

  const words = await loadVisibleWords();
  const entryId = makeWordId(entry);
  const duplicate = words.some((item) => makeWordId(item) === entryId);
  if (duplicate) {
    wordStatus.textContent = "This word entry already exists.";
    return;
  }

  words.push(entry);
  const savedShared = await saveCustomWords(words);
  await renderCustomWords();
  clearWordForm();
  wordStatus.textContent = savedShared
    ? "Word added for all users. Open the dictionary to see it."
    : "Word saved in this browser. Connect the database to share it with everyone.";
});

customWordList.addEventListener("click", async (event) => {
  const button = event.target.closest(".admin-delete-btn");
  if (!button) return;

  const index = Number(button.dataset.index);
  const words = await loadVisibleWords();
  if (!Number.isInteger(index) || index < 0 || index >= words.length) return;

  words.splice(index, 1);
  const savedShared = await saveCustomWords(words);
  await renderCustomWords();
  wordStatus.textContent = savedShared ? "Word deleted for all users." : "Word deleted on this browser.";
});

logoutBtn.addEventListener("click", () => {
  if (!firebaseAuth) {
    setLoggedIn(false);
    return;
  }

  firebaseAuth.signOut().catch(() => {
    setLoggedIn(false);
  });
});

clearFormBtn.addEventListener("click", () => {
  clearWordForm();
  wordStatus.textContent = "";
});

fetchWordBtn.addEventListener("click", fetchWordDetails);
createSectionBtn.addEventListener("click", createSection);
if (sectionListEl) {
  sectionListEl.addEventListener("click", (event) => {
    const button = event.target.closest(".admin-enter-btn");
    const deleteButton = event.target.closest(".admin-delete-section-btn");
    if (button) {
      activateSection(button.dataset.section);
      return;
    }
    if (deleteButton) {
      deleteSection(deleteButton.dataset.section).catch(() => {
        if (sectionStatus) sectionStatus.textContent = "We couldn’t delete that section. Please try again.";
      });
    }
  });
}
if (confirmCancelBtn) confirmCancelBtn.addEventListener("click", () => closeConfirmModal(false));
if (confirmActionBtn) confirmActionBtn.addEventListener("click", () => closeConfirmModal(true));
if (confirmModal) {
  confirmModal.addEventListener("click", (event) => {
    if (event.target && event.target.hasAttribute("data-close-confirm")) {
      closeConfirmModal(false);
    }
  });
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && confirmModal && !confirmModal.hidden) {
    closeConfirmModal(false);
  }
});
fields.sectionName.addEventListener("input", () => {
  updateSectionNameField();
  if (sectionStatus) sectionStatus.textContent = "";
});
updateSectionNameField();
fields.part_of_speech.addEventListener("input", () => {
  const currentValue = fields.part_of_speech.value;
  const validation = validatePartOfSpeechInput(currentValue);
  if (validation.ok) {
    fields.part_of_speech.setCustomValidity("");
    return;
  }
  fields.part_of_speech.setCustomValidity(validation.message);
});
fields.part_of_speech.addEventListener("blur", () => {
  const validation = validatePartOfSpeechInput(fields.part_of_speech.value);
  if (!validation.ok) return;
  fields.part_of_speech.value = validation.value;
  fields.part_of_speech.setCustomValidity("");
});
if (firebaseAuth) {
  firebaseAuth.onAuthStateChanged((user) => {
    setLoggedIn(Boolean(user));
    if (user) {
      loginStatus.textContent = "";
    }
  });
} else {
  setLoggedIn(false);
  loginStatus.textContent = "Sign-in is currently unavailable. Please try again later.";
}
