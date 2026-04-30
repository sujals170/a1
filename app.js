    const state = {
      allWords: [],
      filteredWords: [],
      levels: [],
      levelCounts: {},
      wordsByLevel: {},
      cleanWords: [],
      cleanWordsByLevel: {},
      wordsById: Object.create(null),
      activeLevel: "ALL",
      activePos: "ALL",
      query: "",
      savedWordIds: new Set(),
      showSavedOnly: false,
      currentPage: 1
    };

    const statsEl = document.getElementById("stats");
    const levelFiltersEl = document.getElementById("levelFilters");
    const posFiltersEl = document.getElementById("posFilters");
    const searchInput = document.getElementById("searchInput");
    const clearSearch = document.getElementById("clearSearch");
    const savedToggle = document.getElementById("savedToggle");
    const metaEl = document.getElementById("meta");
    const gridEl = document.getElementById("grid");
    const paginationEl = document.getElementById("pagination");
    const pagePrevBtn = document.getElementById("pagePrevBtn");
    const pageNumbers = document.getElementById("pageNumbers");
    const pageNextBtn = document.getElementById("pageNextBtn");
    const statusEl = document.getElementById("status");
    const studyPlanNameInput = document.getElementById("studyPlanName");
    const studyPlanLevelSel = document.getElementById("studyPlanLevel");
    const studyPlanDaysInput = document.getElementById("studyPlanDays");
    const studyPlanBtn = document.getElementById("studyPlanBtn");
    const studyPlanOutput = document.getElementById("studyPlanOutput");
    const studyPlanBadges = document.getElementById("studyPlanBadges");
    const studyPlanCards = document.getElementById("studyPlanCards");
    const darkModeToggle = document.getElementById("darkModeToggle");
    const DARK_MODE_KEY = "darkMode";
    const SAVED_KEY = "savedWords";
    const STREAK_KEY = "studyStreak";
    const STUDY_PLAN_KEY = "studyPlanPrefs";
    const QUIZ_PROGRESS_KEY = "quizProgress";
    const QUIZ_WRONG_KEY = "quizWrongAnswers";
    const QUIZ_NAME_KEY = "quizPlayerName";
    const QUIZ_WRONG_TTL_MS = 24 * 60 * 60 * 1000;
    const SEARCH_DEBOUNCE_MS = 120;
    const PAGE_SIZE = 60;
    const MAX_PAGE_BUTTONS = 7;
    let filterDebounceId = null;

    const PRACTICE_AUTO_CLOSE_DELAY_MS = 1200;
    const PRACTICE_WRONG_RESET_DELAY_MS = 550;
    let activePracticeCard = null;
    let practiceAutoCloseTimerId = null;

    function clearPracticeAutoCloseTimer() {
      if (practiceAutoCloseTimerId !== null) {
        clearTimeout(practiceAutoCloseTimerId);
        practiceAutoCloseTimerId = null;
      }
    }

    function practiceExpectedLetters(word) {
      return String(word ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z]/g, "");
    }

    function setPracticeFeedback(cardEl, kind, text) {
      const feedback = cardEl.querySelector(".practice-feedback");
      if (!feedback) return;
      feedback.classList.toggle("ok", kind === "ok");
      feedback.classList.toggle("bad", kind === "bad");
      feedback.textContent = text || "";
    }

    function focusPracticeInput(cardEl) {
      const input = cardEl.querySelector(".card-spell-input");
      if (!input) return;
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }
    }

    function closePracticeCard(cardEl) {
      clearPracticeAutoCloseTimer();
      if (!cardEl) return;
      cardEl.classList.remove("is-flipped");
      const back = cardEl.querySelector(".card-back");
      if (back) back.setAttribute("aria-hidden", "true");

      const input = cardEl.querySelector(".card-spell-input");
      if (input) {
        const wasFocused = document.activeElement === input;
        input.value = "";
        if (wasFocused) {
          input.blur();
          try {
            cardEl.focus({ preventScroll: true });
          } catch {
            cardEl.focus();
          }
        }
      }
      setPracticeFeedback(cardEl, "", "");

      if (activePracticeCard === cardEl) {
        activePracticeCard = null;
      }
    }

    function openPracticeCard(cardEl) {
      if (!cardEl) return;
      clearPracticeAutoCloseTimer();
      if (activePracticeCard && activePracticeCard !== cardEl) {
        closePracticeCard(activePracticeCard);
      }

      const expected = practiceExpectedLetters(cardEl.dataset.word || "");
      if (!expected) {
        return;
      }

      activePracticeCard = cardEl;
      cardEl.classList.add("is-flipped");
      const back = cardEl.querySelector(".card-back");
      if (back) back.setAttribute("aria-hidden", "false");

      setPracticeFeedback(cardEl, "", "");

      const input = cardEl.querySelector(".card-spell-input");
      if (input) {
        input.value = "";
        input.maxLength = expected.length;
        input.dataset.expected = expected;
        input.placeholder = `${expected.length} letters...`;
      }

      // On touch devices skip auto-focus: the OS keyboard opening shifts page layout.
      // The user can tap the input directly (click guard on .card-back keeps it open).
      const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
      if (!isTouchDevice) {
        setTimeout(() => {
          if (!cardEl.isConnected) return;
          focusPracticeInput(cardEl);
        }, 520);
      }
    }

    function handlePracticeInput(inputEl) {
      const cardEl = inputEl.closest(".practice-card");
      if (!cardEl) return;
      const expected = inputEl.dataset.expected || practiceExpectedLetters(cardEl.dataset.word || "");
      if (!expected) return;

      let value = String(inputEl.value || "").toLowerCase().replace(/[^a-z]/g, "");
      if (value.length > expected.length) value = value.slice(0, expected.length);
      if (value !== inputEl.value) inputEl.value = value;

      clearPracticeAutoCloseTimer();

      if (value.length < expected.length) {
        setPracticeFeedback(cardEl, "", "");
        return;
      }

      if (value === expected) {
        setPracticeFeedback(cardEl, "ok", "Correct!");
        practiceAutoCloseTimerId = setTimeout(() => {
          if (!cardEl.isConnected) return;
          closePracticeCard(cardEl);
        }, PRACTICE_AUTO_CLOSE_DELAY_MS);
        return;
      }

      setPracticeFeedback(cardEl, "bad", "Wrong — try again");
      practiceAutoCloseTimerId = setTimeout(() => {
        if (!cardEl.isConnected) return;
        inputEl.value = "";
        setPracticeFeedback(cardEl, "", "");
        if (!window.matchMedia("(pointer: coarse)").matches) {
          focusPracticeInput(cardEl);
        }
      }, PRACTICE_WRONG_RESET_DELAY_MS);
    }
    const POS_FILTERS = [
      "Noun",
      "Verb",
      "Adjective",
      "Adverb",
      "Preposition",
      "Pronoun",
      "Conjunction",
      "Modal",
      "Determiner",
      "Exclamation",
      "Number",
      "Article"
    ];
    const POS_RULES = {
      Noun: /\b(n|noun)\b/,
      Verb: /\b(v|verb)\b|\bauxiliary\b/,
      Adjective: /\b(adj|adjective)\b/,
      Adverb: /\b(adv|adverb)\b/,
      Preposition: /\b(prep|preposition)\b/,
      Pronoun: /\b(pron|pronoun)\b/,
      Conjunction: /\b(conj|conjunction)\b/,
      Modal: /\bmodal\b/,
      Determiner: /\b(det|determiner)\b/,
      Exclamation: /\b(exclam|exclamation|interj|interjection)\b/,
      Number: /\b(number|num|numeral)\b/,
      Article: /\barticle\b/
    };

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }


    function normalize(value) {
      return String(value ?? "").toLowerCase().trim();
    }

    function normalizeWordList(value) {
      if (Array.isArray(value)) {
        return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
      }
      if (typeof value === "string") {
        return value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
      }
      return [];
    }

    const CAN_SPEAK = typeof window !== "undefined"
      && "speechSynthesis" in window
      && "SpeechSynthesisUtterance" in window;
    let preferredVoice = null;

    function getPreferredVoice() {
      if (!CAN_SPEAK) return null;
      const voices = window.speechSynthesis.getVoices();
      preferredVoice = voices.find((voice) => /^en(-|_)(us|gb|in|au|ca)\b/i.test(voice.lang))
        || voices.find((voice) => /^en\b/i.test(voice.lang))
        || null;
      return preferredVoice;
    }

    function speakWord(value) {
      const word = String(value ?? "").trim();
      if (!word) return;
      if (!CAN_SPEAK) {
        statusEl.style.display = "block";
        statusEl.textContent = "Pronunciation is not supported in this browser.";
        return;
      }

      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(word);
        utterance.lang = "en-US";
        utterance.rate = 0.95;
        const voice = preferredVoice || getPreferredVoice();
        if (voice) {
          utterance.voice = voice;
        }
        window.speechSynthesis.speak(utterance);
      } catch (error) {
      }
    }

    if (CAN_SPEAK && typeof window.speechSynthesis.onvoiceschanged !== "undefined") {
      window.speechSynthesis.onvoiceschanged = () => {
        preferredVoice = null;
        getPreferredVoice();
      };
    }

    function getWordId(item) {
      return [
        item.level ?? "",
        item.word ?? "",
        item.part_of_speech ?? "",
        item.english_meaning ?? ""
      ].join("|");
    }

    function saveSavedWords() {
      try {
        localStorage.setItem(SAVED_KEY, JSON.stringify(Array.from(state.savedWordIds)));
      } catch (error) {
      }
    }

    function loadSavedWords() {
      try {
        const raw = localStorage.getItem(SAVED_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) {
          state.savedWordIds = new Set(parsed.map((x) => String(x)));
        }
      } catch (error) {
        state.savedWordIds = new Set();
      }
    }

    function normalizeQuizProgressStore(raw) {
      // Backward compatibility: old versions stored a single number as plain text.
      if (typeof raw === "number" && Number.isFinite(raw)) {
        return { __legacy: Math.max(0, Math.floor(raw)) };
      }
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return {};
      }
      const next = {};
      Object.entries(raw).forEach(([key, value]) => {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) return;
        next[String(key)] = Math.floor(n);
      });
      return next;
    }

    function loadQuizProgress(levelKey = "ALL") {
      const safeLevel = String(levelKey || "ALL");
      try {
        const raw = localStorage.getItem(QUIZ_PROGRESS_KEY);
        if (!raw) return 0;

        const asNum = Number(raw);
        if (Number.isFinite(asNum)) {
          const legacyVal = Math.max(0, Math.floor(asNum));
          const upgraded = normalizeQuizProgressStore({ __legacy: legacyVal });
          upgraded[safeLevel] = legacyVal;
          localStorage.setItem(QUIZ_PROGRESS_KEY, JSON.stringify(upgraded));
          return legacyVal;
        }

        const parsed = JSON.parse(raw);
        const store = normalizeQuizProgressStore(parsed);
        const val = Number(store[safeLevel]);
        return Number.isFinite(val) ? Math.max(0, Math.floor(val)) : 0;
      } catch {
        return 0;
      }
    }

    function saveQuizProgress(levelKey = "ALL", index = 0) {
      const safeLevel = String(levelKey || "ALL");
      const safeIndex = Math.max(0, Math.floor(Number(index) || 0));
      try {
        const raw = localStorage.getItem(QUIZ_PROGRESS_KEY);
        let store = {};
        if (raw) {
          const asNum = Number(raw);
          if (Number.isFinite(asNum)) {
            store = normalizeQuizProgressStore({ __legacy: asNum });
          } else {
            store = normalizeQuizProgressStore(JSON.parse(raw));
          }
        }
        store[safeLevel] = safeIndex;
        localStorage.setItem(QUIZ_PROGRESS_KEY, JSON.stringify(store));
      } catch {}
    }

    function getQuizProgressKey(levelKey = "ALL", typeKey = "word2meaning") {
      const safeLevel = String(levelKey || "ALL");
      const safeType = String(typeKey || "word2meaning");
      return `${safeLevel}::${safeType}`;
    }

    function initStreak() {
      let streak = { count: 0, lastDate: "" };
      try {
        const raw = localStorage.getItem(STREAK_KEY);
        if (raw) streak = JSON.parse(raw) || streak;
      } catch {}
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (streak.lastDate === today) {
        // already visited today — no change
      } else if (streak.lastDate === yesterday) {
        streak.count += 1;
        streak.lastDate = today;
      } else {
        streak.count = 1;
        streak.lastDate = today;
      }
      try {
        localStorage.setItem(STREAK_KEY, JSON.stringify(streak));
      } catch {}
      const banner = document.getElementById("streakBanner");
      const text = document.getElementById("streakText");
      if (banner && text) {
        text.textContent = `Day ${streak.count} streak!`;
        banner.removeAttribute("hidden");
      }
    }

    function loadStudyPlanPrefs() {
      try {
        const raw = localStorage.getItem(STUDY_PLAN_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        return {};
      }
    }

    function saveStudyPlanPrefs(next) {
      try {
        localStorage.setItem(STUDY_PLAN_KEY, JSON.stringify(next));
      } catch {}
    }

    function getStudyPlanSignature(name, level, days) {
      return `${String(name || "").trim().toLowerCase()}|${String(level || "ALL")}|${Math.max(1, Math.round(Number(days) || 1))}`;
    }

    function renderStudyPlanLevels() {
      if (!studyPlanLevelSel) return;
      const pending = String(studyPlanLevelSel.dataset.pendingLevel || "");
      const current = String(studyPlanLevelSel.value || pending || "ALL");
      studyPlanLevelSel.innerHTML = '<option value="ALL">All Levels</option>';
      state.levels.forEach((level) => {
        const opt = document.createElement("option");
        opt.value = level;
        opt.textContent = level;
        studyPlanLevelSel.appendChild(opt);
      });
      studyPlanLevelSel.value = state.levels.includes(current) || current === "ALL" ? current : "ALL";
      studyPlanLevelSel.dataset.pendingLevel = "";
    }

    function buildPersonalizedPlan() {
      if (!studyPlanNameInput || !studyPlanLevelSel || !studyPlanDaysInput || !studyPlanOutput || !studyPlanBadges || !studyPlanCards) return;
      const name = String(studyPlanNameInput.value || "").trim().slice(0, 24);
      const level = String(studyPlanLevelSel.value || "ALL");
      const days = Math.max(1, Math.round(Number(studyPlanDaysInput.value) || 0));
      studyPlanDaysInput.value = String(days);
      if (!name) {
        studyPlanOutput.hidden = true;
        studyPlanBadges.innerHTML = "";
        studyPlanCards.innerHTML = "";
        studyPlanNameInput.focus();
        return;
      }
      const totalWords = level === "ALL"
        ? state.allWords.length
        : (state.levelCounts[level] || 0);
      if (totalWords < 1) {
        studyPlanOutput.hidden = true;
        studyPlanBadges.innerHTML = "";
        studyPlanCards.innerHTML = "";
        return;
      }
      const wordsPerDay = Math.ceil(totalWords / days);
      const extraDays = totalWords % days;
      const finishDate = new Date();
      finishDate.setDate(finishDate.getDate() + days - 1);
      const finishLabel = finishDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
      const levelLabel = level === "ALL" ? "all levels" : `${level} level`;
      const distribution = extraDays === 0
        ? `${wordsPerDay} words every day`
        : `${extraDays} day(s) with ${wordsPerDay} words, remaining ${days - extraDays} day(s) with ${Math.max(wordsPerDay - 1, 1)} words`;
      studyPlanOutput.hidden = true;
      const prefs = loadStudyPlanPrefs();
      const signature = getStudyPlanSignature(name, level, days);
      const doneByPlan = (prefs.doneByPlan && typeof prefs.doneByPlan === "object") ? prefs.doneByPlan : {};
      const doneSet = new Set(Array.isArray(doneByPlan[signature]) ? doneByPlan[signature].map((n) => Number(n)).filter(Number.isFinite) : []);
      const badges = [
        `Name: ${name}`,
        `Level: ${level}`,
        `Total: ${totalWords}`,
        `Days: ${days}`,
        `Daily: ${wordsPerDay}`,
        `Split: ${extraDays}x${wordsPerDay}, ${days - extraDays}x${Math.max(wordsPerDay - 1, 1)}`,
        `Finish: ${finishLabel}`
      ];
      studyPlanBadges.innerHTML = badges.map((text) => `<span class="badge">${escapeHtml(text)}</span>`).join("");
      const base = Math.floor(totalWords / days);
      let remainder = totalWords % days;
      let start = 1;
      const dayCards = [];
      for (let day = 1; day <= days; day++) {
        const count = base + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
        const end = start + count - 1;
        const isDone = doneSet.has(day);
        dayCards.push(`
          <article class="study-plan-day-card${isDone ? " is-done" : ""}" data-day="${day}">
            <div class="study-plan-day-title">Day ${day}</div>
            <div class="study-plan-day-main">${count} words</div>
            <div class="study-plan-day-sub">Words ${start}-${end}${isDone ? " • Done" : ""}</div>
          </article>
        `);
        start = end + 1;
      }
      studyPlanCards.innerHTML = dayCards.join("");
      saveStudyPlanPrefs({ ...prefs, name, level, days, doneByPlan });
    }

    function initializeStudyPlanForm() {
      if (!studyPlanNameInput || !studyPlanLevelSel || !studyPlanDaysInput) return;
      const prefs = loadStudyPlanPrefs();
      const savedQuizName = (() => {
        try {
          return String(localStorage.getItem(QUIZ_NAME_KEY) || "").trim();
        } catch {
          return "";
        }
      })();
      studyPlanNameInput.value = String(prefs.name || savedQuizName || "").slice(0, 24);
      studyPlanDaysInput.value = String(Math.max(1, Math.round(Number(prefs.days) || 30)));
      studyPlanLevelSel.dataset.pendingLevel = String(prefs.level || "ALL");
      studyPlanLevelSel.value = "ALL";
    }

    function updateSavedToggle() {
      const count = state.savedWordIds.size;
      savedToggle.textContent = state.showSavedOnly ? `Saved Only: ${count}` : `Saved: ${count}`;
      savedToggle.classList.toggle("active", state.showSavedOnly);
      savedToggle.setAttribute("aria-pressed", state.showSavedOnly ? "true" : "false");
      updateQuizSavedButtonLabel();
    }

    function matchPartOfSpeech(posTextNormalized, selectedPos) {
      if (selectedPos === "ALL") return true;
      const pattern = POS_RULES[selectedPos];
      return pattern ? pattern.test(posTextNormalized) : false;
    }

    function makeStat(label, value) {
      const el = document.createElement("span");
      el.className = "badge";
      el.textContent = `${label}: ${value}`;
      return el;
    }

    function renderStats() {
      statsEl.innerHTML = "";
      statsEl.appendChild(makeStat("Total", state.allWords.length));
      statsEl.appendChild(makeStat("Saved", state.savedWordIds.size));
      state.levels.forEach((level) => {
        const count = state.levelCounts[level] ?? 0;
        statsEl.appendChild(makeStat(level, count));
      });
    }

    function createFilterButton(label, isActive, onClick) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `filter-btn${isActive ? " active" : ""}`;
      btn.textContent = label;
      btn.addEventListener("click", onClick);
      return btn;
    }

    function renderLevelFilters() {
      levelFiltersEl.innerHTML = "";
      levelFiltersEl.appendChild(createFilterButton("ALL", state.activeLevel === "ALL", () => {
        state.activeLevel = "ALL";
        renderLevelFilters();
        applyFilters();
      }));

      state.levels.forEach((level) => {
        levelFiltersEl.appendChild(createFilterButton(level, state.activeLevel === level, () => {
          state.activeLevel = level;
          renderLevelFilters();
          applyFilters();
        }));
      });
    }

    function renderPosFilters() {
      posFiltersEl.innerHTML = "";
      posFiltersEl.appendChild(createFilterButton("All", state.activePos === "ALL", () => {
        state.activePos = "ALL";
        renderPosFilters();
        applyFilters();
      }));

      POS_FILTERS.forEach((pos) => {
        const isActive = state.activePos === pos;
        posFiltersEl.appendChild(createFilterButton(pos, isActive, () => {
          state.activePos = pos;
          renderPosFilters();
          applyFilters();
        }));
      });
    }

    function cardHtml(item, savedIds) {
      const safeWord = escapeHtml(item.word);
      const safeWordId = escapeHtml(item._id);
      const synonyms = normalizeWordList(item.synonyms);
      const antonyms = normalizeWordList(item.antonyms);
      const synonymBadges = synonyms
        .map((value) => `<span class="vocab-badge syn" title="Synonym">${escapeHtml(value)}</span>`)
        .join("");
      const antonymBadges = antonyms
        .map((value) => `<span class="vocab-badge ant" title="Antonym">${escapeHtml(value)}</span>`)
        .join("");
      const vocabMeta = (synonymBadges || antonymBadges)
        ? `<div class="vocab-badges">${synonymBadges}${antonymBadges}</div>`
        : "";
      return `
        <article class="card practice-card" data-word-id="${safeWordId}" data-word="${safeWord}" tabindex="0" role="button" aria-label="Practice spelling for ${safeWord}">
          <div class="card-front">
            <div class="card-head">
              <div>
                <h3 class="word">${safeWord}</h3>
                <span class="pos">${escapeHtml(item.part_of_speech)}</span>
              </div>
              <div class="card-actions">
                <span class="level-tag">${escapeHtml(item.level)}</span>
                <button class="pronounce-btn" type="button" data-speak="${safeWord}" aria-label="Pronounce ${safeWord}">
                  Speak
                </button>
                <button class="save-btn ${savedIds.has(item._id) ? "saved" : ""}" type="button" data-word-id="${safeWordId}">
                  ${savedIds.has(item._id) ? "Saved" : "Save"}
                </button>
              </div>
            </div>
            <div class="card-panel">
              <p class="meaning">${escapeHtml(item.english_meaning)}</p>
              <p class="gujarati">${escapeHtml(item.gujarati)}</p>
            </div>
            <div class="card-example-wrap">
              <p class="example">${escapeHtml(item.example_sentence)}</p>
            </div>
            ${vocabMeta ? `<div class="card-vocab-wrap">${vocabMeta}</div>` : ""}
          </div>
          <div class="card-back" aria-hidden="true">
            <p class="practice-label">Spelling Practice <span class="practice-close-hint">(tap outside input to close)</span></p>
            <input class="card-spell-input" type="text" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" inputmode="text" aria-label="Type spelling" placeholder="Type the word..." />
            <div class="practice-feedback" aria-live="polite"></div>
          </div>
        </article>
      `;
    }

    function createPageButton(label, page, isActive) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `page-btn${isActive ? " active" : ""}`;
      btn.textContent = label;
      if (isActive) {
        btn.setAttribute("aria-current", "page");
      }
      btn.addEventListener("click", () => {
        if (state.currentPage === page) return;
        state.currentPage = page;
        renderCards();
      });
      return btn;
    }

    function getPageList(totalPages, currentPage, maxButtons) {
      if (totalPages <= maxButtons) {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
      }

      const pages = [1];
      const innerCount = Math.max(1, maxButtons - 2);
      let start = Math.max(2, currentPage - Math.floor((innerCount - 1) / 2));
      let end = Math.min(totalPages - 1, start + innerCount - 1);
      start = Math.max(2, end - innerCount + 1);

      if (start > 2) pages.push("...");
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (end < totalPages - 1) pages.push("...");
      pages.push(totalPages);
      return pages;
    }

    function renderPagination(totalPages) {
      if (totalPages <= 1) {
        paginationEl.hidden = true;
        pageNumbers.innerHTML = "";
        return;
      }

      paginationEl.hidden = false;
      pagePrevBtn.disabled = state.currentPage <= 1;
      pageNextBtn.disabled = state.currentPage >= totalPages;
      pageNumbers.innerHTML = "";

      const pages = getPageList(totalPages, state.currentPage, MAX_PAGE_BUTTONS);
      pages.forEach((entry) => {
        if (entry === "...") {
          const span = document.createElement("span");
          span.className = "page-ellipsis";
          span.textContent = "...";
          pageNumbers.appendChild(span);
          return;
        }
        pageNumbers.appendChild(createPageButton(String(entry), entry, entry === state.currentPage));
      });
    }

    function renderCards() {
      clearPracticeAutoCloseTimer();
      activePracticeCard = null;

      const rows = state.filteredWords;
      if (!rows.length) {
        gridEl.innerHTML = '<div class="card"><div class="meaning">No matching words found.</div></div>';
        paginationEl.hidden = true;
        metaEl.textContent = `Showing 0 of ${state.allWords.length} words`;
        return;
      }

      const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
      if (state.currentPage > totalPages) {
        state.currentPage = totalPages;
      }

      const start = (state.currentPage - 1) * PAGE_SIZE;
      const end = Math.min(start + PAGE_SIZE, rows.length);
      const pageRows = rows.slice(start, end);

      const savedIds = state.savedWordIds;
      gridEl.innerHTML = pageRows.map((item) => cardHtml(item, savedIds)).join("");
      renderPagination(totalPages);
      metaEl.textContent = `Showing ${start + 1}-${end} of ${rows.length} matches (${state.allWords.length} total)`;
    }

    function applyFilters() {
      const query = state.query;
      let pool;
      if (state.showSavedOnly) {
        pool = Array.from(state.savedWordIds).map((id) => state.wordsById[id]).filter(Boolean);
      } else if (state.activeLevel === "ALL") {
        pool = state.allWords;
      } else {
        pool = state.wordsByLevel[state.activeLevel] || [];
      }

      state.filteredWords = pool.filter((item) => {
        if (state.activeLevel !== "ALL" && item.level !== state.activeLevel) return false;
        if (!matchPartOfSpeech(item._posNormalized, state.activePos)) return false;
        if (!query) return true;
        return item._searchText.includes(query);
      });

      state.currentPage = 1;
      renderCards();
    }

    async function fetchWordsJson() {
      const [wordRes, cambridgeRes] = await Promise.all([
        fetch("word.json").catch(() => null),
        fetch("cambridge.json").catch(() => null)
      ]);

      let combinedJson = { levels: {} };

      if (wordRes && wordRes.ok) {
        const wordJson = await wordRes.json();
        if (wordJson && wordJson.levels) {
          Object.assign(combinedJson.levels, wordJson.levels);
        }
      }

      if (cambridgeRes && cambridgeRes.ok) {
        const cambridgeJson = await cambridgeRes.json();
        if (cambridgeJson && cambridgeJson.levels) {
          Object.assign(combinedJson.levels, cambridgeJson.levels);
        }
      }

      if (Object.keys(combinedJson.levels).length === 0) {
        throw new Error("Could not load any word data.");
      }

      return combinedJson;
    }

    async function loadWords() {
      try {
        let json = null;
        const embedded = document.getElementById("wordData");

        if (location.protocol !== "file:") {
          try {
            json = await fetchWordsJson();
          } catch (error) {
          }
        }

        if (!json && embedded) {
          const raw = embedded.textContent.trim();
          if (raw) {
            json = JSON.parse(raw);
          }
        }

        if (!json) {
          json = await fetchWordsJson();
        }

        if (embedded) {
          embedded.textContent = "";
          embedded.remove();
        }

        const levels = json && json.levels ? json.levels : {};
        state.levels = Object.keys(levels).sort();
        state.levelCounts = {};
        state.wordsByLevel = {};
        state.cleanWordsByLevel = {};
        state.wordsById = Object.create(null);

        const allWords = state.levels.flatMap((level) => {
          const words = Array.isArray(levels[level]) ? levels[level] : [];
          const mapped = words.map((entry) => {
            const { ielts_tip, ...entryWithoutTip } = entry || {};
            const item = {
              ...entryWithoutTip,
              level,
              synonyms: normalizeWordList(entryWithoutTip.synonyms),
              antonyms: normalizeWordList(entryWithoutTip.antonyms)
            };
            const id = getWordId(item);
            return {
              ...item,
              _id: id,
              _posNormalized: normalize(item.part_of_speech).replace(/[^a-z]+/g, " ").trim(),
              _searchText: normalize([
                item.word,
                item.part_of_speech,
                item.english_meaning,
                item.gujarati,
                item.example_sentence,
                item.synonyms.join(" "),
                item.antonyms.join(" "),
                item.level
              ].join(" "))
            };
          });
          mapped.sort((a, b) => {
            return String(a.word).localeCompare(String(b.word), undefined, { sensitivity: "base" });
          });

          state.levelCounts[level] = mapped.length;
          state.wordsByLevel[level] = mapped;
          state.cleanWordsByLevel[level] = mapped.filter((w) => !/[\s,\/]/.test(w.word));
          mapped.forEach((item) => {
            state.wordsById[item._id] = item;
          });
          return mapped;
        });

        state.allWords = allWords.sort((a, b) => {
          return String(a.word).localeCompare(String(b.word), undefined, { sensitivity: "base" });
        });
        state.cleanWords = state.allWords.filter((w) => !/[\s,\/]/.test(w.word));

        renderStats();
        renderLevelFilters();
        renderPosFilters();
        renderStudyPlanLevels();
        buildPersonalizedPlan();
        applyFilters();
      } catch (error) {
        statusEl.style.display = "block";
        statusEl.textContent = `Could not load word.json (${error.message}). Run with a local server.`;
        metaEl.textContent = "Failed to load data.";
      }
    }

    searchInput.addEventListener("input", (event) => {
      state.query = normalize(event.target.value);
      clearTimeout(filterDebounceId);
      filterDebounceId = setTimeout(() => {
        applyFilters();
      }, SEARCH_DEBOUNCE_MS);
    });

    clearSearch.addEventListener("click", () => {
      state.query = "";
      searchInput.value = "";
      clearTimeout(filterDebounceId);
      applyFilters();
    });

    if (studyPlanBtn) {
      studyPlanBtn.addEventListener("click", buildPersonalizedPlan);
    }
    if (studyPlanDaysInput) {
      studyPlanDaysInput.addEventListener("change", () => {
        const days = Math.max(1, Math.round(Number(studyPlanDaysInput.value) || 1));
        studyPlanDaysInput.value = String(days);
      });
    }
    if (studyPlanCards) {
      studyPlanCards.addEventListener("click", (event) => {
        const card = event.target.closest(".study-plan-day-card");
        if (!card || !studyPlanNameInput || !studyPlanLevelSel || !studyPlanDaysInput) return;
        const day = Number(card.dataset.day);
        if (!Number.isFinite(day) || day < 1) return;
        const name = String(studyPlanNameInput.value || "").trim().slice(0, 24);
        const level = String(studyPlanLevelSel.value || "ALL");
        const days = Math.max(1, Math.round(Number(studyPlanDaysInput.value) || 1));
        if (!name) return;
        const signature = getStudyPlanSignature(name, level, days);
        const prefs = loadStudyPlanPrefs();
        const doneByPlan = (prefs.doneByPlan && typeof prefs.doneByPlan === "object") ? prefs.doneByPlan : {};
        const list = Array.isArray(doneByPlan[signature]) ? doneByPlan[signature].map((n) => Number(n)).filter(Number.isFinite) : [];
        const set = new Set(list);
        if (set.has(day)) {
          set.delete(day);
        } else {
          set.add(day);
        }
        doneByPlan[signature] = Array.from(set).sort((a, b) => a - b);
        saveStudyPlanPrefs({ ...prefs, name, level, days, doneByPlan });
        buildPersonalizedPlan();
      });
    }

    pagePrevBtn.addEventListener("click", () => {
      if (state.currentPage <= 1) return;
      state.currentPage -= 1;
      renderCards();
    });

    pageNextBtn.addEventListener("click", () => {
      const totalPages = Math.max(1, Math.ceil(state.filteredWords.length / PAGE_SIZE));
      if (state.currentPage >= totalPages) return;
      state.currentPage += 1;
      renderCards();
    });

    gridEl.addEventListener("click", (event) => {
      const speakBtn = event.target.closest(".pronounce-btn");
      if (speakBtn) {
        speakWord(speakBtn.dataset.speak || "");
        return;
      }

      const saveBtn = event.target.closest(".save-btn");
      if (saveBtn) {
        const wordId = saveBtn.dataset.wordId || "";
        if (!wordId) return;

        const isSaved = state.savedWordIds.has(wordId);
        if (isSaved) {
          state.savedWordIds.delete(wordId);
        } else {
          state.savedWordIds.add(wordId);
        }

        saveSavedWords();
        renderStats();
        updateSavedToggle();

        if (state.showSavedOnly) {
          applyFilters();
          return;
        }

        saveBtn.classList.toggle("saved", !isSaved);
        saveBtn.textContent = isSaved ? "Save" : "Saved";
        return;
      }

      const cardEl = event.target.closest(".practice-card");
      if (!cardEl) return;

      if (event.target.closest(".card-back")) {
        // Clicking directly on the input — let the browser handle focus, stay open
        if (event.target.closest(".card-spell-input")) return;
        // Clicking the feedback, label, or any other back area — unflip
        closePracticeCard(cardEl);
        return;
      }

      if (cardEl.classList.contains("is-flipped")) {
        closePracticeCard(cardEl);
        return;
      }

      openPracticeCard(cardEl);
    });

    gridEl.addEventListener("input", (event) => {
      const inputEl = event.target.closest(".card-spell-input");
      if (!inputEl) return;
      handlePracticeInput(inputEl);
    });

    gridEl.addEventListener("keydown", (event) => {
      const inputEl = event.target.closest(".card-spell-input");
      if (inputEl && event.key === "Escape") {
        const cardEl = inputEl.closest(".practice-card");
        if (cardEl) {
          event.preventDefault();
          closePracticeCard(cardEl);
          try {
            cardEl.focus({ preventScroll: true });
          } catch {
            cardEl.focus();
          }
        }
        return;
      }

      const cardEl = event.target.closest(".practice-card");
      if (!cardEl) return;
      if (event.target !== cardEl) return;

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (cardEl.classList.contains("is-flipped")) {
          closePracticeCard(cardEl);
        } else {
          openPracticeCard(cardEl);
        }
      }
    });

    savedToggle.addEventListener("click", () => {
      state.showSavedOnly = !state.showSavedOnly;
      updateSavedToggle();
      applyFilters();
    });


    // Quiz Logic
    const quizPanel = document.getElementById("quizPanel");
    const dictionaryPanel = document.querySelector(".panel");
    const studyPlanSection = document.getElementById("studyPlanSection");
    const tabDictionary = document.getElementById("tabDictionary");
    const tabQuiz = document.getElementById("tabQuiz");
    const tabPlan = document.getElementById("tabPlan");
    const quizMeta = document.getElementById("quizMeta");
    const quizScoreBadge = document.getElementById("quizScoreBadge");
    const quizProgressFill = document.getElementById("quizProgressFill");
    const quizPrompt = document.getElementById("quizPrompt");
    const quizWordDisplay = document.getElementById("quizWordDisplay");
    const quizPosDisplay = document.getElementById("quizPosDisplay");
    const quizLevelDisplay = document.getElementById("quizLevelDisplay");
    const quizSpeakBtn = document.getElementById("quizSpeakBtn");
    const quizOptions = document.getElementById("quizOptions");
    const quizFeedback = document.getElementById("quizFeedback");
    const quizQuestionBackBtn = document.getElementById("quizQuestionBackBtn");
    const quizPrevQuestionBtn = document.getElementById("quizPrevQuestionBtn");
    const quizNextQuestionBtn = document.getElementById("quizNextQuestionBtn");
    const quizQuestion = document.getElementById("quizQuestion");
    const quizResults = document.getElementById("quizResults");
    const quizLevelSel = document.getElementById("quizLevel");
    const quizTypeSel = document.getElementById("quizType");
    const quizLimitSel = document.getElementById("quizLimit");
    const quizSavedBtn = document.getElementById("quizSavedBtn");
    const quizSeqBtn = document.getElementById("quizSeqBtn");
    const quizWrongBankBtn = document.getElementById("quizWrongBankBtn");
    const quizSynPracticeBtn = document.getElementById("quizSynPracticeBtn");
    const quizAntPracticeBtn = document.getElementById("quizAntPracticeBtn");
    const quizBackBtn = document.getElementById("quizBackBtn");
    const quizRestartBtn = document.getElementById("quizRestartBtn");
    const quizReviewBtn = document.getElementById("quizReviewBtn");
    const quizPlayAgainBtn = document.getElementById("quizPlayAgainBtn");
    const quizResultsLeaveRoomBtn = document.getElementById("quizResultsLeaveRoomBtn");
    const quizResultEmoji = document.getElementById("quizResultEmoji");
    const quizFinalScore = document.getElementById("quizFinalScore");
    const quizTotalDisplay = document.getElementById("quizTotalDisplay");
    const quizCorrectCount = document.getElementById("quizCorrectCount");
    const quizWrongCount = document.getElementById("quizWrongCount");
    const quizAccuracy = document.getElementById("quizAccuracy");
    const quizWrongReview = document.getElementById("quizWrongReview");
    const quizPlayerNameInput = document.getElementById("quizPlayerName");
    const quizJoinPlayerNameInput = document.getElementById("quizJoinPlayerName");
    const quizRoomCodeInput = document.getElementById("quizRoomCodeInput");
    const quizJoinRoomBtn = document.getElementById("quizJoinRoomBtn");
    const quizCopyRoomBtn = document.getElementById("quizCopyRoomBtn");
    const quizLeaveRoomBtn = document.getElementById("quizLeaveRoomBtn");
    const quizRoomStatus = document.getElementById("quizRoomStatus");
    const quizRoomBadge = document.getElementById("quizRoomBadge");
    const quizRoomPlayers = document.getElementById("quizRoomPlayers");
    const quizRoomResults = document.getElementById("quizRoomResults");
    const quizRoomResultsList = document.getElementById("quizRoomResultsList");
    const quizRoomLiveResults = document.getElementById("quizRoomLiveResults");
    const quizRoomLiveResultsList = document.getElementById("quizRoomLiveResultsList");
    const roomCreateLevelSel = document.getElementById("roomCreateLevel");
    const roomCreateModeSel = document.getElementById("roomCreateMode");
    const roomCreateCountSel = document.getElementById("roomCreateCount");
    const roomCreateConfirmBtn = document.getElementById("roomCreateConfirmBtn");

    const QUIZ_DEFAULT_TOTAL = 10;
    const QUIZ_ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let quizAutoNextTimerId = null;
    let quizCountdownIntervalId = null;
    let quizMaxAnsweredIndex = -1;
    let quizFrontierIndex = 0;
    const quizCountdown = document.getElementById("quizCountdown");
    const quizCountdownNum = document.getElementById("quizCountdownNum");
    let quizUseSavedOnly = false;
    let quizUseWrongOnly = false;
    let quizSequentialMode = false;
    let quizSeqStartIndex = 0;

    const quizState = {
      questions: [],
      current: 0,
      score: 0,
      answered: false,
      wrongAnswers: []
    };
    const quizRoomState = {
      db: null,
      roomRef: null,
      roomCode: "",
      playerId: "",
      playerName: "",
      isHost: false,
      listener: null,
      lastAppliedQuizKey: "",
      latestRoomValue: null
    };

    function getFirebaseDb() {
      try {
        if (typeof firebase === "undefined") return null;
        const cfg = window.APP_CONFIG && window.APP_CONFIG.firebase;
        if (!cfg || !cfg.apiKey || !cfg.databaseURL) return null;
        if (!quizRoomState.db) {
          const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg);
          quizRoomState.db = firebase.database(app);
        }
        return quizRoomState.db;
      } catch {
        return null;
      }
    }

    function setQuizRoomStatus(message) {
      if (quizRoomStatus) {
        quizRoomStatus.textContent = String(message || "");
      }
    }

    function normalizeRoomCode(value) {
      return String(value || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 8);
    }

    function loadQuizPlayerName() {
      let stored = "";
      try {
        stored = localStorage.getItem(QUIZ_NAME_KEY) || "";
      } catch {}
      return String(stored || "").trim();
    }

    function saveQuizPlayerName(value) {
      const name = String(value || "").trim().slice(0, 24);
      try {
        localStorage.setItem(QUIZ_NAME_KEY, name);
      } catch {}
      return name;
    }

    function getQuizPlayerName() {
      return saveQuizPlayerName(quizPlayerNameInput ? quizPlayerNameInput.value : "");
    }

    function generateQuizRoomCode(length = 6) {
      let code = "";
      for (let i = 0; i < length; i++) {
        const index = Math.floor(Math.random() * QUIZ_ROOM_CODE_ALPHABET.length);
        code += QUIZ_ROOM_CODE_ALPHABET[index];
      }
      return code;
    }

    function isQuizRoomActive() {
      return Boolean(quizRoomState.roomCode && quizRoomState.roomRef && quizRoomState.playerId);
    }

    function serializeQuizOption(opt) {
      if (!opt || typeof opt !== "object") return null;
      return {
        _id: String(opt._id || ""),
        word: String(opt.word || ""),
        english_meaning: String(opt.english_meaning || ""),
        gujarati: String(opt.gujarati || ""),
        part_of_speech: String(opt.part_of_speech || ""),
        level: String(opt.level || "")
      };
    }

    function hydrateQuizOption(raw) {
      if (!raw || typeof raw !== "object") return null;
      const refId = String(raw._id || "");
      if (refId && state.wordsById[refId]) {
        return state.wordsById[refId];
      }
      return {
        _id: refId,
        word: String(raw.word || ""),
        english_meaning: String(raw.english_meaning || ""),
        gujarati: String(raw.gujarati || ""),
        part_of_speech: String(raw.part_of_speech || ""),
        level: String(raw.level || "")
      };
    }

    function serializeQuizQuestion(question) {
      if (!question || typeof question !== "object") return null;
      return {
        correct: serializeQuizOption(question.correct),
        correctOption: serializeQuizOption(question.correctOption || question.correct),
        relation: String(question.relation || ""),
        options: Array.isArray(question.options) ? question.options.map(serializeQuizOption).filter(Boolean) : []
      };
    }

    function hydrateQuizQuestion(raw) {
      if (!raw || typeof raw !== "object") return null;
      const options = Array.isArray(raw.options) ? raw.options.map(hydrateQuizOption).filter(Boolean) : [];
      const correct = hydrateQuizOption(raw.correct);
      const correctOption = hydrateQuizOption(raw.correctOption) || correct;
      if (!correct || !options.length) return null;
      return {
        correct,
        correctOption,
        relation: String(raw.relation || ""),
        options
      };
    }

    function getCurrentQuizSettings() {
      return {
        level: quizLevelSel.value,
        type: quizTypeSel.value,
        limit: normalizeQuizLimitInput(),
        useSavedOnly: quizUseSavedOnly,
        useWrongOnly: quizUseWrongOnly,
        sequential: quizSequentialMode
      };
    }

    function syncRoomCreateFormOptions() {
      if (!roomCreateLevelSel || !roomCreateModeSel || !roomCreateCountSel || !quizLevelSel || !quizTypeSel || !quizLimitSel) return;
      roomCreateLevelSel.innerHTML = quizLevelSel.innerHTML;
      roomCreateModeSel.innerHTML = quizTypeSel.innerHTML;
      roomCreateLevelSel.value = quizLevelSel.value || "ALL";
      roomCreateModeSel.value = quizTypeSel.value || "word2meaning";
      roomCreateCountSel.value = quizLimitSel.value || String(QUIZ_DEFAULT_TOTAL);
    }

    function applyQuizSettingsSnapshot(settings) {
      if (!settings || typeof settings !== "object") return;
      quizLevelSel.value = settings.level || "ALL";
      quizTypeSel.value = settings.type || "word2meaning";
      quizLimitSel.value = String(settings.limit || QUIZ_DEFAULT_TOTAL);
      quizUseSavedOnly = Boolean(settings.useSavedOnly);
      quizUseWrongOnly = Boolean(settings.useWrongOnly);
      updateQuizSavedButtonLabel();
      quizWrongBankBtn.classList.toggle("active", quizUseWrongOnly);
      quizWrongBankBtn.textContent = quizUseWrongOnly ? "Wrong Attempts: Room Quiz" : "Wrong Attempts: Off";
      quizSequentialMode = Boolean(settings.sequential);
      updateSynAntPracticeButtons();
      updateSeqBtnState();
      quizSeqBtn.classList.toggle("active", quizSequentialMode && !quizSeqBtn.disabled);
      if (!quizSeqBtn.disabled) {
        quizSeqBtn.textContent = quizSequentialMode ? "Sequential: On" : "Sequential: Off";
      }
    }

    function setQuizConfigDisabled(disabled) {
      const next = Boolean(disabled);
      [
        quizLevelSel,
        quizTypeSel,
        quizLimitSel,
        quizSavedBtn,
        quizSeqBtn,
        quizWrongBankBtn,
        quizSynPracticeBtn,
        quizAntPracticeBtn,
        quizRestartBtn,
        quizPlayAgainBtn
      ].forEach((el) => {
        if (el) el.disabled = next;
      });
    }

    function getAnsweredQuizCount() {
      return quizState.questions.filter((question) => question && question.result).length;
    }

    function renderQuizRoomPlayers(players) {
      if (!quizRoomPlayers) return;
      const entries = Object.entries(players || {});
      if (!entries.length) {
        quizRoomPlayers.innerHTML = "";
        if (quizRoomResultsList) quizRoomResultsList.innerHTML = "";
        if (quizRoomResults) quizRoomResults.hidden = true;
        if (quizRoomLiveResultsList) quizRoomLiveResultsList.innerHTML = "";
        if (quizRoomLiveResults) quizRoomLiveResults.hidden = true;
        return;
      }
      const sorted = entries.sort((a, b) => {
        const aJoined = Number(a[1] && a[1].joinedAt) || 0;
        const bJoined = Number(b[1] && b[1].joinedAt) || 0;
        return aJoined - bJoined;
      });
      const cardHtml = sorted.map(([id, player]) => {
        const safeName = escapeHtml(player && player.name ? player.name : "Player");
        const score = Number(player && player.score) || 0;
        const total = Number(player && player.total) || quizState.questions.length || 0;
        const answered = Number(player && player.answeredCount) || 0;
        const finished = player && player.finished;
        const isMe = id === quizRoomState.playerId;
        const status = finished
          ? "Finished ✔"
          : total > 0
          ? `Q ${Math.min(answered + 1, total)} of ${total}`
          : "Waiting…";
        const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
        const initials = safeName.replace(/&amp;/g, "&").replace(/&#39;/g, "'")
          .split(/\s+/).filter(Boolean).slice(0, 2)
          .map(w => w[0]).join("").toUpperCase() || "?";
        return `
          <div class="quiz-room-player${isMe ? " is-me" : ""}${finished ? " is-finished" : ""}">
            <div class="quiz-room-avatar">${escapeHtml(initials)}</div>
            <div class="quiz-room-player-body">
              <div class="quiz-room-player-name">${safeName}${isMe ? " <em style='font-style:normal;opacity:.6;font-weight:600;font-size:11px'>(You)</em>" : ""}</div>
              <div class="quiz-room-player-meta">${escapeHtml(status)}</div>
              <div class="quiz-room-progress-track"><div class="quiz-room-progress-fill" style="width:${pct}%"></div></div>
            </div>
            <div class="quiz-room-player-score">${score}<span>/ ${total || "-"}</span></div>
          </div>
        `;
      }).join("");
      quizRoomPlayers.innerHTML = cardHtml;
      if (quizRoomResultsList) quizRoomResultsList.innerHTML = cardHtml;
      if (quizRoomLiveResultsList) quizRoomLiveResultsList.innerHTML = cardHtml;
      if (quizRoomResults) quizRoomResults.hidden = false;
      if (quizRoomLiveResults) quizRoomLiveResults.hidden = !isQuizRoomActive();
    }

    function updateQuizRoomUi() {
      const active = isQuizRoomActive();
      const card = quizRoomBadge && quizRoomBadge.closest(".quiz-room-card");
      if (card) card.classList.toggle("is-active", active);
      if (quizRoomBadge) {
        quizRoomBadge.textContent = active ? `Room ${quizRoomState.roomCode}` : "Solo Mode";
        quizRoomBadge.classList.toggle("is-active", active);
      }
      if (roomCreateConfirmBtn) roomCreateConfirmBtn.disabled = active;
      if (quizJoinRoomBtn) quizJoinRoomBtn.disabled = active;
      if (quizCopyRoomBtn) quizCopyRoomBtn.disabled = !active;
      if (quizLeaveRoomBtn) quizLeaveRoomBtn.disabled = !active;
      if (quizRoomCodeInput) quizRoomCodeInput.disabled = active;
      if (quizRoomLiveResults) quizRoomLiveResults.hidden = !active;
      if (quizResultsLeaveRoomBtn) quizResultsLeaveRoomBtn.hidden = !active;
      if (typeof updateRoomPanelUi === "function") updateRoomPanelUi();
    }

    function getQuizRoomPlayerPayload(extra = {}) {
      return {
        name: quizRoomState.playerName || getQuizPlayerName(),
        score: quizState.score,
        answeredCount: getAnsweredQuizCount(),
        current: quizState.current,
        total: quizState.questions.length,
        finished: false,
        updatedAt: firebase.database.ServerValue.TIMESTAMP,
        ...extra
      };
    }

    function normalizeWrongAnswerEntry(entry) {
      if (!entry || typeof entry !== "object") return null;
      const correctItemId = String(entry.correctItemId || "").trim();
      const timestamp = Number(entry.timestamp);
      if (!correctItemId || !Number.isFinite(timestamp) || timestamp <= 0) return null;
      return {
        prompt: String(entry.prompt || "-"),
        selectedText: String(entry.selectedText || "-"),
        correctText: String(entry.correctText || "-"),
        correctItemId,
        timestamp
      };
    }

    function pruneWrongAnswerEntries(entries, nowMs = Date.now()) {
      if (!Array.isArray(entries) || !entries.length) return [];
      const deduped = new Map();
      entries.forEach((raw) => {
        const entry = normalizeWrongAnswerEntry(raw);
        if (!entry) return;
        if (nowMs - entry.timestamp > QUIZ_WRONG_TTL_MS) return;
        const prev = deduped.get(entry.correctItemId);
        if (!prev || entry.timestamp > prev.timestamp) {
          deduped.set(entry.correctItemId, entry);
        }
      });
      return Array.from(deduped.values()).sort((a, b) => b.timestamp - a.timestamp);
    }

    function saveWrongAnswerBank(entries) {
      try {
        localStorage.setItem(QUIZ_WRONG_KEY, JSON.stringify(entries));
      } catch {}
    }

    function loadWrongAnswerBank() {
      let parsed = [];
      try {
        const raw = localStorage.getItem(QUIZ_WRONG_KEY);
        const data = raw ? JSON.parse(raw) : [];
        parsed = Array.isArray(data) ? data : [];
      } catch {
        parsed = [];
      }
      const fresh = pruneWrongAnswerEntries(parsed);
      saveWrongAnswerBank(fresh);
      return fresh;
    }

    function addWrongAnswerToBank(entry) {
      const clean = normalizeWrongAnswerEntry({
        ...entry,
        timestamp: Date.now()
      });
      if (!clean) return;
      const current = pruneWrongAnswerEntries(quizState.wrongAnswers);
      const next = pruneWrongAnswerEntries([clean, ...current], clean.timestamp);
      quizState.wrongAnswers = next;
      saveWrongAnswerBank(next);
      updateQuizWrongBankButton(next.length);
    }

    function removeWrongAnswerFromBank(correctItemId) {
      const id = String(correctItemId || "").trim();
      if (!id) return;
      const current = pruneWrongAnswerEntries(quizState.wrongAnswers);
      const next = current.filter((entry) => entry.correctItemId !== id);
      if (next.length === current.length) return;
      quizState.wrongAnswers = next;
      if (!next.length) {
        quizUseWrongOnly = false;
      }
      saveWrongAnswerBank(next);
      updateQuizWrongBankButton(next.length);
    }

    function getActiveWrongAnswers() {
      const fresh = pruneWrongAnswerEntries(quizState.wrongAnswers);
      if (fresh.length !== quizState.wrongAnswers.length) {
        quizState.wrongAnswers = fresh;
        if (!fresh.length) {
          quizUseWrongOnly = false;
        }
        saveWrongAnswerBank(fresh);
      }
      return fresh;
    }
    quizState.wrongAnswers = loadWrongAnswerBank();

    function getWrongQuizPool(level) {
      const wrongItems = getActiveWrongAnswers();
      const validAll = wrongItems.filter((entry) => Boolean(state.wordsById[entry.correctItemId]));
      if (validAll.length !== wrongItems.length) {
        quizState.wrongAnswers = validAll;
        if (!validAll.length) {
          quizUseWrongOnly = false;
        }
        saveWrongAnswerBank(validAll);
        updateQuizWrongBankButton(validAll.length);
      }
      const source = validAll.length !== wrongItems.length ? validAll : wrongItems;
      const mapped = source
        .map((entry) => state.wordsById[entry.correctItemId])
        .filter(Boolean);
      if (level === "ALL") return mapped;
      return mapped.filter((item) => item.level === level);
    }

    function updateQuizWrongBankButton(countOverride) {
      if (!quizWrongBankBtn) return;
      const count = Number.isFinite(Number(countOverride))
        ? Math.max(0, Math.floor(Number(countOverride)))
        : getActiveWrongAnswers().length;
      if (count <= 0 && quizUseWrongOnly) {
        quizUseWrongOnly = false;
      }
      const isOn = quizUseWrongOnly && count > 0;
      quizWrongBankBtn.textContent = isOn
        ? `Wrong Attempts: On (${count})`
        : `Wrong Attempts: Off (${count})`;
      quizWrongBankBtn.disabled = count <= 0;
      quizWrongBankBtn.classList.toggle("active", isOn);
      quizWrongBankBtn.title = count > 0
        ? "Toggle wrong-attempt quiz mode"
        : "No wrong attempts saved yet";
    }

    function setQuizWrongMode(enabled) {
      const count = getActiveWrongAnswers().length;
      quizUseWrongOnly = Boolean(enabled) && count > 0;
      updateQuizWrongBankButton(count);
    }

    function shuffleArray(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    function updateQuizSavedButtonLabel() {
      const count = state.savedWordIds.size;
      quizSavedBtn.classList.toggle("active", quizUseSavedOnly);
      quizSavedBtn.textContent = quizUseSavedOnly
        ? `Saved Cards: On (${count})`
        : `Saved Cards: Off (${count})`;
    }

    function setQuizSavedMode(enabled) {
      quizUseSavedOnly = Boolean(enabled);
      updateQuizSavedButtonLabel();
    }

    function updateSynAntPracticeButtons() {
      const type = quizTypeSel.value;
      if (quizSynPracticeBtn) {
        const isOn = type === "synonym";
        quizSynPracticeBtn.classList.toggle("active", isOn);
        quizSynPracticeBtn.textContent = isOn ? "Synonyms Practice: On" : "Synonyms Practice: Off";
        quizSynPracticeBtn.setAttribute("aria-pressed", isOn ? "true" : "false");
      }
      if (quizAntPracticeBtn) {
        const isOn = type === "antonym";
        quizAntPracticeBtn.classList.toggle("active", isOn);
        quizAntPracticeBtn.textContent = isOn ? "Antonyms Practice: On" : "Antonyms Practice: Off";
        quizAntPracticeBtn.setAttribute("aria-pressed", isOn ? "true" : "false");
      }
    }

    function getSavedQuizPool(level) {
      const savedPool = Array.from(state.savedWordIds)
        .map((id) => state.wordsById[id])
        .filter(Boolean);
      if (level === "ALL") return savedPool;
      return savedPool.filter((item) => item.level === level);
    }

    function getQuizPool() {
      const level = quizLevelSel.value;
      if (quizUseWrongOnly) {
        return getWrongQuizPool(level);
      }
      if (quizUseSavedOnly) {
        return getSavedQuizPool(level);
      }
      if (level === "ALL") {
        return state.allWords;
      }
      return state.wordsByLevel[level] || [];
    }

    function normalizeQuizLimitInput() {
      const requested = Number(quizLimitSel.value);
      if (!Number.isFinite(requested) || requested < 1) {
        quizLimitSel.value = String(QUIZ_DEFAULT_TOTAL);
        return QUIZ_DEFAULT_TOTAL;
      }
      const rounded = Math.max(1, Math.round(requested));
      quizLimitSel.value = String(rounded);
      return rounded;
    }

    function getQuizQuestionLimit(poolSize) {
      if (!Number.isFinite(poolSize) || poolSize < 1) {
        return 1;
      }
      const requested = normalizeQuizLimitInput();
      return Math.min(requested, poolSize);
    }

    function pickQuizDistractors(pool, correctId, count, fallbackPool = []) {
      if (!Array.isArray(pool) || pool.length <= 1 || count < 1) {
        const fb = Array.isArray(fallbackPool) ? fallbackPool : [];
        if (!fb.length || count < 1) return [];
        const usedFallback = new Set([correctId]);
        return shuffleArray(fb).filter((item) => {
          if (!item || usedFallback.has(item._id)) return false;
          usedFallback.add(item._id);
          return true;
        }).slice(0, count);
      }
      const distractors = [];
      const usedIds = new Set([correctId]);
      const maxNeeded = Math.min(count, Math.max(pool.length - 1, 0));
      let attempts = 0;
      const maxAttempts = pool.length * 8;
      while (distractors.length < maxNeeded && attempts < maxAttempts) {
        const candidate = pool[Math.floor(Math.random() * pool.length)];
        attempts++;
        if (!candidate || usedIds.has(candidate._id)) continue;
        usedIds.add(candidate._id);
        distractors.push(candidate);
      }
      if (distractors.length < maxNeeded) {
        for (let i = 0; i < pool.length && distractors.length < maxNeeded; i++) {
          const candidate = pool[i];
          if (!candidate || usedIds.has(candidate._id)) continue;
          usedIds.add(candidate._id);
          distractors.push(candidate);
        }
      }
      if (distractors.length < count && Array.isArray(fallbackPool) && fallbackPool.length) {
        const fallbackCandidates = shuffleArray(fallbackPool);
        for (let i = 0; i < fallbackCandidates.length && distractors.length < count; i++) {
          const candidate = fallbackCandidates[i];
          if (!candidate || usedIds.has(candidate._id)) continue;
          usedIds.add(candidate._id);
          distractors.push(candidate);
        }
      }
      return distractors;
    }

    function buildQuizQuestions(pool, limit) {
      const shuffled = shuffleArray(pool);
      const questions = [];
      const targetTotal = Math.max(1, limit);
      for (let i = 0; i < Math.min(targetTotal, shuffled.length); i++) {
        const correct = shuffled[i];
        const distractors = pickQuizDistractors(pool, correct._id, 3, state.allWords);
        const options = shuffleArray([correct, ...distractors]);
        questions.push({ correct, options });
      }
      return questions;
    }

    function buildSequentialQuizQuestions(pool, limit, levelKey = "ALL") {
      const progress = loadQuizProgress(getQuizProgressKey(levelKey, quizTypeSel.value));
      quizSeqStartIndex = pool.length > 0 ? progress % pool.length : 0;
      const questions = [];
      const targetTotal = Math.max(1, limit);
      for (let i = 0; i < Math.min(targetTotal, pool.length); i++) {
        const idx = (quizSeqStartIndex + i) % pool.length;
        const correct = pool[idx];
        const distractors = pickQuizDistractors(pool, correct._id, 3, state.allWords);
        const options = shuffleArray([correct, ...distractors]);
        questions.push({ correct, options });
      }
      return questions;
    }

    function formatQuizOptionText(item, type) {
      if (!item) return "-";
      if (type === "synonym" || type === "antonym") {
        return String(item.word || "-");
      }
      return type === "word2meaning"
        ? String(item.english_meaning || "-")
        : String(item.word || "-");
    }

    function getSynAntValues(item, relation) {
      const list = relation === "antonym" ? item.antonyms : item.synonyms;
      return normalizeWordList(list);
    }

    function getSynAntQuestionPool(pool, relation = "") {
      return pool.filter((item) => {
        const syn = getSynAntValues(item, "synonym");
        const ant = getSynAntValues(item, "antonym");
        if (relation === "synonym") return syn.length > 0;
        if (relation === "antonym") return ant.length > 0;
        return syn.length > 0 || ant.length > 0;
      });
    }

    function getSynAntDistractorTexts(relation, correctText, questionPool, fallbackPool = [], cap = 3) {
      const wanted = Math.max(1, cap);
      const usedNorm = new Set([normalize(correctText)]);
      const distractors = [];
      const tryPush = (text) => {
        const clean = String(text || "").trim();
        if (!clean) return false;
        const key = normalize(clean);
        if (!key || usedNorm.has(key)) return false;
        usedNorm.add(key);
        distractors.push(clean);
        return distractors.length >= wanted;
      };

      const source = shuffleArray(questionPool);
      for (let i = 0; i < source.length && distractors.length < wanted; i++) {
        const values = getSynAntValues(source[i], relation);
        for (let j = 0; j < values.length && distractors.length < wanted; j++) {
          if (tryPush(values[j])) break;
        }
      }

      const fallback = shuffleArray(fallbackPool);
      for (let i = 0; i < fallback.length && distractors.length < wanted; i++) {
        if (tryPush(fallback[i].word)) break;
      }

      return distractors.slice(0, wanted);
    }

    function buildSynAntQuestionForWord(correct, questionPool, forcedRelation = "") {
      const relation = forcedRelation === "antonym" ? "antonym" : "synonym";
      const values = shuffleArray(getSynAntValues(correct, relation));
      const correctText = values[0];
      if (!correctText) return null;

      const distractorTexts = getSynAntDistractorTexts(
        relation,
        correctText,
        questionPool.filter((item) => item._id !== correct._id),
        state.allWords,
        3
      );
      if (!distractorTexts.length) return null;

      const correctOpt = {
        _id: `synant:${relation}:${correct._id}:correct:${normalize(correctText)}`,
        word: correctText
      };
      const distractorOpts = distractorTexts.map((text, idx) => ({
        _id: `synant:${relation}:${correct._id}:d:${idx}:${normalize(text)}`,
        word: text
      }));
      const options = shuffleArray([correctOpt, ...distractorOpts]);
      return {
        correct,
        relation,
        correctOption: correctOpt,
        options
      };
    }

    function buildSynAntQuizQuestions(pool, limit, relation, sequential = false, levelKey = "ALL") {
      const rel = relation === "antonym" ? "antonym" : "synonym";
      const questionPool = getSynAntQuestionPool(pool, rel);
      if (!questionPool.length) {
        quizSeqStartIndex = 0;
        return [];
      }

      const targetTotal = Math.max(1, Math.min(limit, questionPool.length));
      const questions = [];
      const source = sequential ? questionPool : shuffleArray(questionPool);

      if (sequential) {
        const progress = loadQuizProgress(getQuizProgressKey(levelKey, rel));
        quizSeqStartIndex = source.length > 0 ? progress % source.length : 0;
        for (let i = 0; i < source.length && questions.length < targetTotal; i++) {
          const idx = (quizSeqStartIndex + i) % source.length;
          const question = buildSynAntQuestionForWord(source[idx], questionPool, rel);
          if (question) questions.push(question);
        }
      } else {
        quizSeqStartIndex = 0;
        for (let i = 0; i < source.length && questions.length < targetTotal; i++) {
          const question = buildSynAntQuestionForWord(source[i], questionPool, rel);
          if (question) questions.push(question);
        }
      }

      return questions;
    }

    function renderQuizWrongReview() {
      const wrongItems = getActiveWrongAnswers();
      updateQuizWrongBankButton(wrongItems.length);
      if (!quizWrongReview || !quizReviewBtn) {
        return;
      }
      if (!wrongItems.length) {
        quizWrongReview.hidden = true;
        quizWrongReview.innerHTML = "";
        quizReviewBtn.hidden = true;
        return;
      }

      quizReviewBtn.hidden = false;
      quizWrongReview.hidden = false;
      quizWrongReview.innerHTML = wrongItems.map((entry, index) => {
        return `
          <article class="quiz-wrong-item">
            <p class="quiz-wrong-title">Review Item ${index + 1}</p>
            <p class="quiz-wrong-prompt">${escapeHtml(entry.prompt)}</p>
            <p class="quiz-wrong-line"><span class="lbl">Your answer:</span> ${escapeHtml(entry.selectedText)}</p>
            <p class="quiz-wrong-line"><span class="lbl">Correct answer:</span> ${escapeHtml(entry.correctText)}</p>
          </article>
        `;
      }).join("");
    }

    function reviewWrongAnswers() {
      const wrongItems = getActiveWrongAnswers();
      if (!wrongItems.length) {
        quizFeedback.textContent = "No wrong attempts available right now.";
        quizFeedback.className = "quiz-feedback";
        return;
      }
      setQuizWrongMode(true);
      startQuiz();
      quizFeedback.textContent = "Wrong attempts mode is on.";
      quizFeedback.className = "quiz-feedback";
    }

    function resetQuizWithQuestions(questions) {
      quizState.questions = Array.isArray(questions) ? questions : [];
      quizState.current = 0;
      quizState.score = 0;
      quizState.answered = false;
      quizMaxAnsweredIndex = -1;
      quizFrontierIndex = 0;
      quizTotalDisplay.textContent = String(quizState.questions.length);
      quizResults.classList.remove("visible");
      quizQuestion.style.display = "block";
      renderQuizWrongReview();
      renderQuizQuestion();
    }

    function renderQuizEmptyState(prompt, wordText, tip) {
      quizState.questions = [];
      quizState.current = 0;
      quizState.score = 0;
      quizState.answered = false;
      quizMaxAnsweredIndex = -1;
      quizFrontierIndex = 0;
      quizTotalDisplay.textContent = "0";
      quizResults.classList.remove("visible");
      quizQuestion.style.display = "block";
      quizMeta.textContent = "No questions available";
      quizScoreBadge.textContent = "Score: 0";
      quizProgressFill.style.width = "0%";
      quizPrompt.textContent = prompt;
      quizWordDisplay.textContent = wordText;
      quizPosDisplay.textContent = "POS: -";
      quizLevelDisplay.textContent = `Level: ${quizLevelSel.value}`;
      quizSpeakBtn.dataset.word = "";
      quizSpeakBtn.disabled = true;
      quizOptions.innerHTML = "";
      quizFeedback.textContent = tip;
      quizFeedback.className = "quiz-feedback";
      renderQuizWrongReview();
    }

    function syncQuizRoomProgress(extra = {}) {
      if (!isQuizRoomActive() || !quizRoomState.roomRef) return;
      const payload = getQuizRoomPlayerPayload(extra);
      quizRoomState.roomRef.child(`players/${quizRoomState.playerId}`).update(payload).catch(() => {});
    }

    function applyQuizRoomQuestions(roomValue) {
      if (!roomValue || !roomValue.quizKey || roomValue.quizKey === quizRoomState.lastAppliedQuizKey) return;
      const hydrated = Array.isArray(roomValue.questions)
        ? roomValue.questions.map(hydrateQuizQuestion).filter(Boolean)
        : [];
      if (!hydrated.length) return;
      applyQuizSettingsSnapshot(roomValue.settings || {});
      setQuizConfigDisabled(true);
      resetQuizWithQuestions(hydrated);
      quizRoomState.lastAppliedQuizKey = String(roomValue.quizKey);
      syncQuizRoomProgress({ finished: false });
    }

    function handleQuizRoomSnapshot(snapshot) {
      const roomValue = snapshot && snapshot.val ? snapshot.val() : null;
      quizRoomState.latestRoomValue = roomValue;
      if (!roomValue) {
        const wasActive = isQuizRoomActive();
        leaveQuizRoom({ preserveQuestions: true, preserveStatus: wasActive ? "Room closed." : "" });
        return;
      }
      if (quizRoomCodeInput) {
        quizRoomCodeInput.value = quizRoomState.roomCode;
      }
      renderQuizRoomPlayers(roomValue.players || {});
      applyQuizRoomQuestions(roomValue);
      const playerCount = roomValue.players ? Object.keys(roomValue.players).length : 0;
      const hostMessage = quizRoomState.isHost && playerCount < 2
        ? "Share the code with your friend so they can join."
        : playerCount >= 2
        ? "Both players are in the room. Start answering."
        : "Waiting for room data...";
      setQuizRoomStatus(hostMessage);
    }

    function detachQuizRoomListener() {
      if (quizRoomState.roomRef && quizRoomState.listener) {
        quizRoomState.roomRef.off("value", quizRoomState.listener);
      }
      quizRoomState.listener = null;
    }

    async function leaveQuizRoom(options = {}) {
      const preserveQuestions = Boolean(options.preserveQuestions);
      const preserveStatus = String(options.preserveStatus || "");
      detachQuizRoomListener();
      if (quizRoomState.roomRef && quizRoomState.playerId) {
        try {
          await quizRoomState.roomRef.child(`players/${quizRoomState.playerId}`).remove();
        } catch {}
        if (quizRoomState.isHost) {
          try {
            await quizRoomState.roomRef.remove();
          } catch {}
        }
      }
      quizRoomState.roomRef = null;
      quizRoomState.roomCode = "";
      quizRoomState.playerId = "";
      quizRoomState.playerName = "";
      quizRoomState.isHost = false;
      quizRoomState.lastAppliedQuizKey = "";
      quizRoomState.latestRoomValue = null;
      setQuizConfigDisabled(false);
      updateQuizSavedButtonLabel();
      updateQuizWrongBankButton();
      updateSeqBtnState();
      updateSynAntPracticeButtons();
      renderQuizRoomPlayers({});
      updateQuizRoomUi();
      setQuizRoomStatus(preserveStatus || "Solo mode is active.");
      if (quizRoomCodeInput && !preserveQuestions) {
        quizRoomCodeInput.value = "";
      }
    }

    async function attachToQuizRoom(roomCode, playerId, isHost) {
      const db = getFirebaseDb();
      if (!db) {
        setQuizRoomStatus("Firebase room sync is not available right now.");
        return false;
      }
      const roomRef = db.ref(`quizRooms/${roomCode}`);
      quizRoomState.roomRef = roomRef;
      quizRoomState.roomCode = roomCode;
      quizRoomState.playerId = playerId;
      quizRoomState.playerName = getQuizPlayerName();
      quizRoomState.isHost = Boolean(isHost);
      quizRoomState.lastAppliedQuizKey = "";
      detachQuizRoomListener();
      roomRef.child(`players/${playerId}`).onDisconnect().remove();
      quizRoomState.listener = (snapshot) => {
        handleQuizRoomSnapshot(snapshot);
      };
      roomRef.on("value", quizRoomState.listener);
      updateQuizRoomUi();
      return true;
    }

    async function createQuizRoom() {
      if (isQuizRoomActive()) return;
      const db = getFirebaseDb();
      if (!db) {
        setQuizRoomStatus("Add working Firebase config to use multiplayer rooms.");
        return;
      }
      const enteredName = getQuizPlayerName();
      if (!enteredName) {
        setQuizRoomStatus("Enter your name before creating a room.");
        if (quizPlayerNameInput) quizPlayerNameInput.focus();
        return;
      }
      startQuiz();
      if (!quizState.questions.length) {
        setQuizRoomStatus("Build a quiz first, then create a room.");
        return;
      }
      const roomCode = generateQuizRoomCode();
      const playerId = `p_${Math.random().toString(36).slice(2, 10)}`;
      const roomRef = db.ref(`quizRooms/${roomCode}`);
      const roomPayload = {
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        hostId: playerId,
        quizKey: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        settings: getCurrentQuizSettings(),
        questions: quizState.questions.map(serializeQuizQuestion).filter(Boolean),
        players: {
          [playerId]: {
            name: enteredName,
            score: 0,
            answeredCount: 0,
            current: 0,
            total: quizState.questions.length,
            finished: false,
            joinedAt: firebase.database.ServerValue.TIMESTAMP,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
          }
        }
      };
      await roomRef.set(roomPayload);
      await attachToQuizRoom(roomCode, playerId, true);
      if (quizRoomCodeInput) {
        quizRoomCodeInput.value = roomCode;
      }
      setQuizConfigDisabled(true);
      setQuizRoomStatus("Room created. Share the code with your friend.");
      switchMode("quiz");
    }

    async function joinQuizRoom() {
      if (isQuizRoomActive()) return;
      const db = getFirebaseDb();
      if (!db) {
        setQuizRoomStatus("Add working Firebase config to use multiplayer rooms.");
        return;
      }
      const enteredName = saveQuizPlayerName(quizJoinPlayerNameInput ? quizJoinPlayerNameInput.value : "");
      if (!enteredName) {
        setQuizRoomStatus("Enter your name before joining a room.");
        if (quizJoinPlayerNameInput) quizJoinPlayerNameInput.focus();
        return;
      }
      const roomCode = normalizeRoomCode(quizRoomCodeInput ? quizRoomCodeInput.value : "");
      if (!roomCode) {
        setQuizRoomStatus("Enter a room code first.");
        if (quizRoomCodeInput) quizRoomCodeInput.focus();
        return;
      }
      const roomRef = db.ref(`quizRooms/${roomCode}`);
      const snapshot = await roomRef.once("value");
      if (!snapshot.exists()) {
        setQuizRoomStatus("That room code was not found.");
        return;
      }
      const roomValue = snapshot.val() || {};
      if (!Array.isArray(roomValue.questions) || !roomValue.questions.length) {
        setQuizRoomStatus("This room does not have a quiz loaded.");
        return;
      }
      const playerCount = roomValue.players ? Object.keys(roomValue.players).length : 0;
      if (playerCount >= 2) {
        setQuizRoomStatus("This room already has two players.");
        return;
      }
      const playerId = `p_${Math.random().toString(36).slice(2, 10)}`;
      await roomRef.child(`players/${playerId}`).set({
        name: enteredName,
        score: 0,
        answeredCount: 0,
        current: 0,
        total: roomValue.questions.length,
        finished: false,
        joinedAt: firebase.database.ServerValue.TIMESTAMP,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
      await attachToQuizRoom(roomCode, playerId, false);
      setQuizConfigDisabled(true);
      setQuizRoomStatus("Joined room. You now have the same quiz questions.");
      switchMode("quiz");
    }

    async function copyQuizRoomCode() {
      if (!isQuizRoomActive()) return;
      try {
        await navigator.clipboard.writeText(quizRoomState.roomCode);
        setQuizRoomStatus(`Room code copied: ${quizRoomState.roomCode}`);
      } catch {
        setQuizRoomStatus(`Room code: ${quizRoomState.roomCode}`);
      }
    }

    function startQuiz() {
      clearQuizRevealTimers();
      if (isQuizRoomActive()) {
        setQuizRoomStatus(`Room ${quizRoomState.roomCode} is active. Leave the room to change quiz settings.`);
        return;
      }
      const type = quizTypeSel.value;
      const pool = getQuizPool();
      const synAntMode = type === "synonym" || type === "antonym";
      const synAntPool = synAntMode ? getSynAntQuestionPool(pool, type) : pool;
      if (!synAntPool.length) {
        const level = quizLevelSel.value;
        const wrongMode = quizUseWrongOnly;
        const savedMode = quizUseSavedOnly;
        const emptyPrompt = synAntMode
          ? `No ${type} data available for this selection.`
          : wrongMode
          ? "No wrong attempts available for this level."
          : savedMode
          ? "No saved cards to quiz right now."
          : `No words found for ${level} level.`;
        const emptyWordText = synAntMode
          ? "Pick another level or switch mode."
          : wrongMode
          ? "Answer some questions wrong first, then retry here."
          : savedMode
          ? "Save cards in Dictionary, then try again."
          : "Choose another level or select All Levels.";
        const emptyTip = synAntMode
          ? `Tip: add more ${type}s in word data or choose another quiz mode.`
          : wrongMode
          ? "Tip: set level to All or answer new quiz questions."
          : savedMode
          ? "Tip: click Save on cards you want to practice in quiz."
          : "Tip: switch level in Quiz settings to continue.";
        renderQuizEmptyState(emptyPrompt, emptyWordText, emptyTip);
        return;
      }
      const limit = getQuizQuestionLimit(synAntPool.length);
      if (synAntMode) {
        quizState.questions = buildSynAntQuizQuestions(synAntPool, limit, type, quizSequentialMode, quizLevelSel.value);
      } else {
        quizState.questions = quizSequentialMode
          ? buildSequentialQuizQuestions(pool, limit, quizLevelSel.value)
          : buildQuizQuestions(pool, limit);
      }
      if (!quizState.questions.length) {
        renderQuizEmptyState(
          "Could not build quiz options for this mode.",
          "Try another level or quiz mode.",
          "Tip: switch mode or level, then restart quiz."
        );
        return;
      }
      resetQuizWithQuestions(quizState.questions);
    }

    function getQuizOptionHtml(opt, type) {
      const isWord2Meaning = type === "word2meaning";
      const isSynAnt = type === "synonym" || type === "antonym";
      const mainText = isWord2Meaning ? opt.english_meaning : opt.word;
      const pronunciationText = String(mainText || "").trim();
      const gujaratiText = String(opt.gujarati || "").trim();
      const speakControl = pronunciationText
        ? `<span class="quiz-opt-speak" data-speak="${escapeHtml(pronunciationText)}" title="Pronounce this option" aria-label="Pronounce this option">🔊</span>`
        : "";
      const gujaratiLine = (isWord2Meaning && !isSynAnt && gujaratiText)
        ? `<span class="quiz-opt-gujarati">${escapeHtml(gujaratiText)}</span>`
        : "";

      return `
        <span class="quiz-opt-top">
          <span class="quiz-opt-main">${escapeHtml(mainText)}</span>
          ${speakControl}
        </span>
        ${gujaratiLine}
      `;
    }

    function clearQuizRevealTimers() {
      if (quizAutoNextTimerId) {
        clearTimeout(quizAutoNextTimerId);
        quizAutoNextTimerId = null;
      }
      if (quizCountdownIntervalId) {
        clearInterval(quizCountdownIntervalId);
        quizCountdownIntervalId = null;
      }
      if (quizCountdown) quizCountdown.hidden = true;
    }

    function startQuizCountdown() {
      let count = 1;
      if (quizCountdown) {
        quizCountdown.hidden = false;
        quizCountdownNum.textContent = String(count);
      }
      quizCountdownIntervalId = setInterval(() => {
        count--;
        if (count <= 0) {
          clearInterval(quizCountdownIntervalId);
          quizCountdownIntervalId = null;
          if (quizCountdown) quizCountdown.hidden = true;
          if (quizState.answered) advanceQuiz();
        } else {
          if (quizCountdownNum) quizCountdownNum.textContent = String(count);
        }
      }, 1000);
    }

    function updateQuizNavButtons() {
      if (quizPrevQuestionBtn) {
        quizPrevQuestionBtn.hidden = quizState.current <= 0;
      }
      if (quizNextQuestionBtn) {
        quizNextQuestionBtn.hidden = quizState.current >= quizFrontierIndex;
      }
    }

    function prevQuestion() {
      if (quizState.current <= 0) return;
      clearQuizRevealTimers();
      quizState.current--;
      renderQuizQuestion();
    }

    function renderQuizOptions(question, type) {
      quizOptions.innerHTML = "";
      question.options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "quiz-opt";
        btn.innerHTML = getQuizOptionHtml(opt, type);
        btn.dataset.id = opt._id;
        btn.addEventListener("click", (event) => {
          const target = event.target;
          if (target instanceof Element) {
            const speakIcon = target.closest(".quiz-opt-speak");
            if (speakIcon) {
              event.preventDefault();
              event.stopPropagation();
              speakWord(speakIcon.dataset.speak || "");
              return;
            }
          }
          handleQuizAnswer(btn, question);
        });
        quizOptions.appendChild(btn);
      });
    }

    function renderQuizQuestion() {
      clearQuizRevealTimers();
      const { current, questions } = quizState;
      const q = questions[current];
      const type = quizTypeSel.value;
      const isWord2Meaning = type === "word2meaning";
      const isSynAnt = type === "synonym" || type === "antonym";

      if (quizSequentialMode) {
        const pool = getQuizPool();
        const absPos = pool.length > 0 ? (quizSeqStartIndex + current) % pool.length : 0;
        quizMeta.textContent = `Question ${current + 1} of ${questions.length} · Word ${absPos + 1} / ${pool.length}`;
      } else {
        quizMeta.textContent = `Question ${current + 1} of ${questions.length}`;
      }
      quizScoreBadge.textContent = `Score: ${quizState.score}`;
      quizProgressFill.style.width = `${(current / questions.length) * 100}%`;
      quizFeedback.textContent = "";
      quizFeedback.className = "quiz-feedback";
      quizState.answered = false;

      if (isWord2Meaning) {
        quizPrompt.textContent = "What does this word mean?";
        quizWordDisplay.textContent = q.correct.word;
      } else if (isSynAnt) {
        const relationLabel = q.relation === "antonym" ? "antonym" : "synonym";
        quizPrompt.textContent = `Choose the ${relationLabel} of this word.`;
        quizWordDisplay.textContent = q.correct.word;
      } else {
        quizPrompt.textContent = "Which word matches this meaning?";
        quizWordDisplay.textContent = q.correct.english_meaning;
      }
      quizPosDisplay.textContent = `POS: ${q.correct.part_of_speech || "-"}`;
      quizLevelDisplay.textContent = `Level: ${q.correct.level || "-"}`;

      quizSpeakBtn.dataset.word = q.correct.word || "";
      quizSpeakBtn.disabled = false;
      quizSpeakBtn.title = "Pronounce this word";

      quizOptions.innerHTML = "";
      renderQuizOptions(q, type);

      if (q.result) {
        quizState.answered = true;
        quizOptions.querySelectorAll(".quiz-opt").forEach(btn => {
          btn.disabled = true;
          if (btn.dataset.id === q.result.correctOptionId) {
            btn.classList.add(q.result.wasCorrect ? "correct" : "reveal-correct");
          }
          if (!q.result.wasCorrect && btn.dataset.id === q.result.selectedId) {
            btn.classList.add("wrong");
          }
        });
        quizFeedback.textContent = q.result.feedbackText;
        quizFeedback.className = q.result.feedbackClass;
      }
      updateQuizNavButtons();
    }

    function handleQuizAnswer(selectedBtn, question) {
      if (quizState.answered) return;
      if (!quizOptions.children.length) return;
      quizState.answered = true;

      const type = quizTypeSel.value;
      const correct = question.correct;
      const isSynAnt = type === "synonym" || type === "antonym";
      const correctOption = isSynAnt ? question.correctOption : correct;
      const isCorrect = selectedBtn.dataset.id === correctOption._id;
      const currentQuestion = quizState.questions[quizState.current];
      const selectedOption = currentQuestion && Array.isArray(currentQuestion.options)
        ? currentQuestion.options.find((opt) => opt._id === selectedBtn.dataset.id) || null
        : null;

      // disable all options and highlight
      quizOptions.querySelectorAll(".quiz-opt").forEach(btn => {
        btn.disabled = true;
        if (btn.dataset.id === correctOption._id) {
          btn.classList.add(isCorrect ? "correct" : "reveal-correct");
        }
      });

      if (isCorrect) {
        selectedBtn.classList.add("correct");
        quizState.score++;
        removeWrongAnswerFromBank(correct._id);
        const correctEngMeaning = isSynAnt && correctOption.english_meaning ? ` • ${correctOption.english_meaning}` : correct.english_meaning ? ` • ${correct.english_meaning}` : "";
        const correctGujarati = isSynAnt && correctOption.gujarati ? ` • ${correctOption.gujarati}` : correct.gujarati ? ` • ${correct.gujarati}` : "";
        quizFeedback.textContent = `Correct! Well done.${correctEngMeaning}${correctGujarati}`;
        quizFeedback.className = "quiz-feedback correct";
      } else {
        selectedBtn.classList.add("wrong");
        const correctText = type === "word2meaning"
          ? correct.english_meaning
          : isSynAnt
          ? correctOption.word
          : correct.word;
        const engMeaning = isSynAnt && correctOption.english_meaning ? ` • ${correctOption.english_meaning}` : correct.english_meaning ? ` • ${correct.english_meaning}` : "";
        const gujarati = isSynAnt && correctOption.gujarati ? ` • ${correctOption.gujarati}` : correct.gujarati ? ` • ${correct.gujarati}` : "";
        quizFeedback.textContent = `Wrong! The correct answer is: "${correctText}"${engMeaning}${gujarati}`;
        quizFeedback.className = "quiz-feedback wrong";
        addWrongAnswerToBank({
          prompt: type === "word2meaning"
            ? `Word: ${correct.word || "-"}`
            : isSynAnt
            ? `${question.relation === "antonym" ? "Antonym" : "Synonym"} of: ${correct.word || "-"}`
            : `Meaning: ${correct.english_meaning || "-"}`,
          selectedText: formatQuizOptionText(selectedOption, type),
          correctText: formatQuizOptionText(correctOption, type),
          correctItemId: correct._id
        });
      }

      quizScoreBadge.textContent = `Score: ${quizState.score}`;

      question.result = {
        selectedId: selectedBtn.dataset.id,
        correctOptionId: correctOption._id,
        wasCorrect: isCorrect,
        feedbackText: quizFeedback.textContent,
        feedbackClass: quizFeedback.className
      };
      quizMaxAnsweredIndex = Math.max(quizMaxAnsweredIndex, quizState.current);
      updateQuizNavButtons();

      if (quizSequentialMode && !isQuizRoomActive()) {
        const pool = getQuizPool();
        if (pool.length > 0) {
          const nextIndex = (quizSeqStartIndex + quizState.current + 1) % pool.length;
          saveQuizProgress(getQuizProgressKey(quizLevelSel.value, quizTypeSel.value), nextIndex);
        }
      }

      syncQuizRoomProgress({ finished: false });
      startQuizCountdown();
    }

    function advanceQuiz() {
      if (!quizState.answered) return;
      quizState.current++;
      quizFrontierIndex = Math.max(quizFrontierIndex, quizState.current);
      syncQuizRoomProgress({ finished: false });
      if (quizState.current >= quizState.questions.length) {
        showQuizResults();
      } else {
        renderQuizQuestion();
      }
    }

    function showQuizResults() {
      clearQuizRevealTimers();
      const { score, questions } = quizState;
      const total = questions.length;
      const wrong = total - score;
      const pct = Math.round((score / total) * 100);

      quizProgressFill.style.width = "100%";
      quizQuestion.style.display = "none";
      quizResults.classList.add("visible");

      quizFinalScore.textContent = `${score} / ${total}`;
      quizCorrectCount.textContent = score;
      quizWrongCount.textContent = wrong;
      quizAccuracy.textContent = `${pct}%`;
      renderQuizWrongReview();
      syncQuizRoomProgress({ finished: true, current: total });

      const emoji = pct === 100 ? "A+" : pct >= 80 ? "A" : pct >= 60 ? "B" : pct >= 40 ? "C" : "Keep Going";
      quizResultEmoji.textContent = emoji;
      if (quizResultsLeaveRoomBtn) quizResultsLeaveRoomBtn.hidden = !isQuizRoomActive();
      if (isQuizRoomActive()) {
        setQuizRoomStatus("Your result is saved. Waiting for the room scoreboard to update.");
      }
    }

    function switchMode(mode) {
      clearQuizRevealTimers();
      if (mode === "quiz") {
        if (state.allWords.length < 4) return;
        dictionaryPanel.style.display = "none";
        if (studyPlanSection) studyPlanSection.style.display = "none";
        quizPanel.classList.add("visible");
        tabDictionary.classList.remove("active");
        tabQuiz.classList.add("active");
        if (tabPlan) tabPlan.classList.remove("active");
        startQuiz();
      } else {
        dictionaryPanel.style.display = "";
        if (studyPlanSection) studyPlanSection.style.display = "none";
        quizPanel.classList.remove("visible");
        tabDictionary.classList.add("active");
        tabQuiz.classList.remove("active");
        if (tabPlan) tabPlan.classList.remove("active");
      }
    }

    function updateSeqBtnState() {
      const levelIsAll = quizLevelSel.value === "ALL";
      const isSynAntMode = quizTypeSel.value === "synonym" || quizTypeSel.value === "antonym";
      quizSeqBtn.disabled = levelIsAll || isSynAntMode;
      quizSeqBtn.title = "";
      if (levelIsAll) {
        quizSeqBtn.textContent = "Sequential: pick a level up";
        if (quizSequentialMode) {
          quizSequentialMode = false;
          quizSeqBtn.classList.remove("active");
          quizLimitSel.disabled = false;
        }
      } else if (isSynAntMode) {
        quizSeqBtn.textContent = "Sequential: unavailable in Syn/Ant mode";
        if (quizSequentialMode) {
          quizSequentialMode = false;
          quizSeqBtn.classList.remove("active");
          quizLimitSel.disabled = false;
        }
      } else {
        quizSeqBtn.textContent = quizSequentialMode ? "Sequential: On" : "Sequential: Off";
      }
    }

    tabDictionary.addEventListener("click", () => switchMode("dictionary"));
    tabQuiz.addEventListener("click", () => switchMode("quiz"));
    quizLevelSel.addEventListener("change", () => {
      updateSeqBtnState();
      startQuiz();
    });
    quizTypeSel.addEventListener("change", () => {
      updateSynAntPracticeButtons();
      updateSeqBtnState();
      startQuiz();
    });
    quizLimitSel.addEventListener("change", () => {
      normalizeQuizLimitInput();
      startQuiz();
    });
    quizSavedBtn.addEventListener("click", () => {
      setQuizSavedMode(!quizUseSavedOnly);
      startQuiz();
    });
    quizSeqBtn.addEventListener("click", () => {
      quizSequentialMode = !quizSequentialMode;
      quizSeqBtn.classList.toggle("active", quizSequentialMode);
      quizSeqBtn.textContent = quizSequentialMode ? "Sequential: On" : "Sequential: Off";
      startQuiz();
    });
    quizWrongBankBtn.addEventListener("click", () => {
      setQuizWrongMode(!quizUseWrongOnly);
      startQuiz();
    });
    if (quizSynPracticeBtn) {
      quizSynPracticeBtn.addEventListener("click", () => {
        quizTypeSel.value = quizTypeSel.value === "synonym" ? "word2meaning" : "synonym";
        updateSynAntPracticeButtons();
        updateSeqBtnState();
        startQuiz();
      });
    }
    if (quizAntPracticeBtn) {
      quizAntPracticeBtn.addEventListener("click", () => {
        quizTypeSel.value = quizTypeSel.value === "antonym" ? "word2meaning" : "antonym";
        updateSynAntPracticeButtons();
        updateSeqBtnState();
        startQuiz();
      });
    }
    if (quizReviewBtn) {
      quizReviewBtn.addEventListener("click", reviewWrongAnswers);
    }
    if (quizBackBtn) {
      quizBackBtn.addEventListener("click", () => switchMode("dictionary"));
    }
    if (quizQuestionBackBtn) {
      quizQuestionBackBtn.addEventListener("click", () => switchMode("dictionary"));
    }
    if (quizPrevQuestionBtn) {
      quizPrevQuestionBtn.addEventListener("click", prevQuestion);
    }
    if (quizNextQuestionBtn) {
      quizNextQuestionBtn.addEventListener("click", () => {
        clearQuizRevealTimers();
        advanceQuiz();
      });
    }
    quizRestartBtn.addEventListener("click", startQuiz);
    quizPlayAgainBtn.addEventListener("click", startQuiz);
    if (quizResultsLeaveRoomBtn) {
      quizResultsLeaveRoomBtn.addEventListener("click", () => {
        leaveQuizRoom({ preserveStatus: "You left the room." }).catch(() => {
          setQuizRoomStatus("Could not leave the room cleanly, but solo mode is available.");
        });
      });
    }
    if (quizPlayerNameInput) {
      quizPlayerNameInput.value = loadQuizPlayerName();
      quizPlayerNameInput.addEventListener("change", () => {
        const saved = saveQuizPlayerName(quizPlayerNameInput.value);
        quizPlayerNameInput.value = saved;
        if (quizJoinPlayerNameInput) quizJoinPlayerNameInput.value = saved;
      });
    }
    if (quizJoinPlayerNameInput) {
      quizJoinPlayerNameInput.value = loadQuizPlayerName();
      quizJoinPlayerNameInput.addEventListener("change", () => {
        const saved = saveQuizPlayerName(quizJoinPlayerNameInput.value);
        quizJoinPlayerNameInput.value = saved;
        if (quizPlayerNameInput) quizPlayerNameInput.value = saved;
      });
    }
    if (quizRoomCodeInput) {
      quizRoomCodeInput.addEventListener("input", () => {
        quizRoomCodeInput.value = normalizeRoomCode(quizRoomCodeInput.value);
      });
    }
    if (roomCreateConfirmBtn) {
      roomCreateConfirmBtn.addEventListener("click", () => {
        if (isQuizRoomActive()) return;
        if (roomCreateLevelSel && quizLevelSel) quizLevelSel.value = roomCreateLevelSel.value;
        if (roomCreateModeSel && quizTypeSel) quizTypeSel.value = roomCreateModeSel.value;
        if (roomCreateCountSel && quizLimitSel) quizLimitSel.value = roomCreateCountSel.value;
        normalizeQuizLimitInput();
        updateSynAntPracticeButtons();
        updateSeqBtnState();
        createQuizRoom().catch(() => {
          setQuizRoomStatus("Could not create the room. Please try again.");
        });
      });
    }
    if (quizJoinRoomBtn) {
      quizJoinRoomBtn.addEventListener("click", () => {
        joinQuizRoom().catch(() => {
          setQuizRoomStatus("Could not join that room. Please try again.");
        });
      });
    }
    if (quizCopyRoomBtn) {
      quizCopyRoomBtn.addEventListener("click", () => {
        copyQuizRoomCode();
      });
    }
    if (quizLeaveRoomBtn) {
      quizLeaveRoomBtn.addEventListener("click", () => {
        leaveQuizRoom({ preserveStatus: "You left the room." }).catch(() => {
          setQuizRoomStatus("Could not leave the room cleanly, but solo mode is available.");
        });
      });
    }
    quizSpeakBtn.addEventListener("click", () => {
      speakWord(quizSpeakBtn.dataset.word || "");
    });
    setQuizSavedMode(false);
    setQuizWrongMode(false);
    updateQuizWrongBankButton();
    updateSynAntPracticeButtons();
    updateSeqBtnState();
    syncRoomCreateFormOptions();
    updateQuizRoomUi();
    setQuizRoomStatus(getFirebaseDb()
      ? "Create a room or join one with a code."
      : "Room features are ready when Firebase is connected.");

    // Multiplayer Panel
    const roomPanel = document.getElementById("roomPanel");
    const tabRoom = document.getElementById("tabRoom");
    const roomGoToQuizBtn = document.getElementById("roomGoToQuizBtn");
    const roomGoQuiz = document.getElementById("roomGoQuiz");
    const roomHowTo = document.getElementById("roomHowTo");

    function updateRoomPanelUi() {
      const active = isQuizRoomActive();
      const goQuiz = document.getElementById("roomGoQuiz");
      const howTo = document.getElementById("roomHowTo");
      if (goQuiz) goQuiz.hidden = !active;
      if (howTo) howTo.hidden = active;
    }

    const _origSwitchMode = switchMode;
    switchMode = function (mode) {
      roomPanel.classList.remove("visible");
      tabRoom.classList.remove("active");
      if (mode === "room") {
        dictionaryPanel.style.display = "none";
        if (studyPlanSection) studyPlanSection.style.display = "none";
        quizPanel.classList.remove("visible");
        roomPanel.classList.add("visible");
        tabDictionary.classList.remove("active");
        tabQuiz.classList.remove("active");
        if (tabPlan) tabPlan.classList.remove("active");
        tabRoom.classList.add("active");
        updateRoomPanelUi();
      } else if (mode === "plan") {
        dictionaryPanel.style.display = "none";
        quizPanel.classList.remove("visible");
        if (studyPlanSection) studyPlanSection.style.display = "block";
        tabDictionary.classList.remove("active");
        tabQuiz.classList.remove("active");
        tabRoom.classList.remove("active");
        if (tabPlan) tabPlan.classList.add("active");
      } else {
        _origSwitchMode(mode);
      }
    };

    if (tabRoom) tabRoom.addEventListener("click", () => switchMode("room"));
    if (tabPlan) tabPlan.addEventListener("click", () => switchMode("plan"));
    if (roomGoToQuizBtn) roomGoToQuizBtn.addEventListener("click", () => switchMode("quiz"));

    loadSavedWords();
    updateSavedToggle();
    initStreak();

    // Live visitor counter — requires Firebase config in config.js
    (function initLiveVisitors() {
      try {
        const db = getFirebaseDb();
        if (!db) return;
        const sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
        const myRef = db.ref("visitors/" + sessionId);

        db.ref(".info/connected").on("value", (snap) => {
          if (!snap.val()) return;
          myRef.onDisconnect().remove();
          myRef.set({ ts: firebase.database.ServerValue.TIMESTAMP });
        });

        db.ref("visitors").on("value", (snap) => {
          const count = snap.numChildren();
          const badge = document.getElementById("visitorBadge");
          const countEl = document.getElementById("visitorCount");
          if (!badge || !countEl) return;
          countEl.textContent = count;
          badge.removeAttribute("hidden");
        });
      } catch (_) {}
    })();

    // Dark Mode Initialization and Toggle
    function initializeDarkMode() {
      const savedTheme = localStorage.getItem(DARK_MODE_KEY);
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const isDark = savedTheme ? savedTheme === "dark" : prefersDark;

      setTheme(isDark ? "dark" : "light");
    }

    function setTheme(theme) {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem(DARK_MODE_KEY, theme);
      updateDarkModeButton(theme === "dark");
    }

    function toggleDarkMode() {
      const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
      const newTheme = currentTheme === "dark" ? "light" : "dark";
      setTheme(newTheme);
    }

    function updateDarkModeButton(isDark) {
      darkModeToggle.textContent = isDark ? "☀️ Light" : "🌙 Dark";
    }

    darkModeToggle.addEventListener("click", toggleDarkMode);

    initializeDarkMode();
    initializeStudyPlanForm();
    loadWords();
