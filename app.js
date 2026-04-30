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
    const darkModeToggle = document.getElementById("darkModeToggle");
    const DARK_MODE_KEY = "darkMode";
    const SAVED_KEY = "savedWords";
    const STREAK_KEY = "studyStreak";
    const QUIZ_PROGRESS_KEY = "quizProgress";
    const QUIZ_WRONG_KEY = "quizWrongAnswers";
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
    const tabDictionary = document.getElementById("tabDictionary");
    const tabQuiz = document.getElementById("tabQuiz");
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
    const quizResultEmoji = document.getElementById("quizResultEmoji");
    const quizFinalScore = document.getElementById("quizFinalScore");
    const quizTotalDisplay = document.getElementById("quizTotalDisplay");
    const quizCorrectCount = document.getElementById("quizCorrectCount");
    const quizWrongCount = document.getElementById("quizWrongCount");
    const quizAccuracy = document.getElementById("quizAccuracy");
    const quizWrongReview = document.getElementById("quizWrongReview");

    const QUIZ_DEFAULT_TOTAL = 10;
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
      const progress = loadQuizProgress(levelKey);
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
        const progress = loadQuizProgress(levelKey);
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

    function startQuiz() {
      clearQuizRevealTimers();
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
        quizPrompt.textContent = emptyPrompt;
        quizWordDisplay.textContent = emptyWordText;
        quizPosDisplay.textContent = "POS: -";
        quizLevelDisplay.textContent = `Level: ${quizLevelSel.value}`;
        quizSpeakBtn.dataset.word = "";
        quizSpeakBtn.disabled = true;
        quizOptions.innerHTML = "";
        quizFeedback.textContent = emptyTip;
        quizFeedback.className = "quiz-feedback";
        renderQuizWrongReview();
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
        quizPrompt.textContent = "Could not build quiz options for this mode.";
        quizWordDisplay.textContent = "Try another level or quiz mode.";
        quizPosDisplay.textContent = "POS: -";
        quizLevelDisplay.textContent = `Level: ${quizLevelSel.value}`;
        quizSpeakBtn.dataset.word = "";
        quizSpeakBtn.disabled = true;
        quizOptions.innerHTML = "";
        quizFeedback.textContent = "Tip: switch mode or level, then restart quiz.";
        quizFeedback.className = "quiz-feedback";
        renderQuizWrongReview();
        return;
      }
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
      let count = 5;
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

      if (quizSequentialMode) {
        const pool = getQuizPool();
        if (pool.length > 0) {
          saveQuizProgress(quizLevelSel.value, (quizSeqStartIndex + quizState.current + 1) % pool.length);
        }
      }

      startQuizCountdown();
    }

    function advanceQuiz() {
      if (!quizState.answered) return;
      quizState.current++;
      quizFrontierIndex = Math.max(quizFrontierIndex, quizState.current);
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

      const emoji = pct === 100 ? "A+" : pct >= 80 ? "A" : pct >= 60 ? "B" : pct >= 40 ? "C" : "Keep Going";
      quizResultEmoji.textContent = emoji;
    }

    function switchMode(mode) {
      clearQuizRevealTimers();
      if (mode === "quiz") {
        if (state.allWords.length < 4) return;
        dictionaryPanel.style.display = "none";
        quizPanel.classList.add("visible");
        tabDictionary.classList.remove("active");
        tabQuiz.classList.add("active");
        startQuiz();
      } else {
        dictionaryPanel.style.display = "";
        quizPanel.classList.remove("visible");
        tabDictionary.classList.add("active");
        tabQuiz.classList.remove("active");
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
    quizSpeakBtn.addEventListener("click", () => {
      speakWord(quizSpeakBtn.dataset.word || "");
    });
    setQuizSavedMode(false);
    setQuizWrongMode(false);
    updateQuizWrongBankButton();
    updateSynAntPracticeButtons();
    updateSeqBtnState();

    // Spelling Logic
    const spellPanel = document.getElementById("spellPanel");
    const tabSpell = document.getElementById("tabSpell");
    const spellMeta = document.getElementById("spellMeta");
    const spellScoreBadge = document.getElementById("spellScoreBadge");
    const spellProgressFill = document.getElementById("spellProgressFill");
    const spellClueMeaning = document.getElementById("spellClueMeaning");
    const spellClueExample = document.getElementById("spellClueExample");
    const spellClueLevel = document.getElementById("spellClueLevel");
    const spellCluePos = document.getElementById("spellCluePos");
    const spellClueLetters = document.getElementById("spellClueLetters");
    const spellSpeakBtn = document.getElementById("spellSpeakBtn");
    const spellTiles = document.getElementById("spellTiles");
    const spellCountHint = document.getElementById("spellCountHint");
    const spellInput = document.getElementById("spellInput");
    const spellFeedback = document.getElementById("spellFeedback");
    const spellHintUsed = document.getElementById("spellHintUsed");
    const spellHintBtn = document.getElementById("spellHintBtn");
    const spellSkipBtn = document.getElementById("spellSkipBtn");
    const spellNextBtn = document.getElementById("spellNextBtn");
    const spellQuestion = document.getElementById("spellQuestion");
    const spellResults = document.getElementById("spellResults");
    const spellLevelSel = document.getElementById("spellLevel");
    const spellRestartBtn = document.getElementById("spellRestartBtn");
    const spellBackBtn = document.getElementById("spellBackBtn");
    const spellPlayAgainBtn = document.getElementById("spellPlayAgainBtn");
    const spellResultEmoji = document.getElementById("spellResultEmoji");
    const spellFinalScore = document.getElementById("spellFinalScore");
    const spellCorrectCount = document.getElementById("spellCorrectCount");
    const spellWrongCount = document.getElementById("spellWrongCount");
    const spellAccuracy = document.getElementById("spellAccuracy");

    const SPELL_TOTAL = 10;
    const SPELL_AUTO_SUBMIT_DELAY_MS = 140;
    const spellSt = {
      words: [],
      current: 0,
      score: 0,
      answered: false,
      hintUsed: false,
      hintsRevealedCount: 0
    };
    let activeSpellTiles = [];
    let spellAutoSubmitTimerId = null;
    let spellCountdownIntervalId = null;
    const spellCountdown = document.getElementById("spellCountdown");
    const spellCountdownNum = document.getElementById("spellCountdownNum");

    function clearSpellCountdown() {
      if (spellCountdownIntervalId) {
        clearInterval(spellCountdownIntervalId);
        spellCountdownIntervalId = null;
      }
      if (spellCountdown) spellCountdown.hidden = true;
    }

    function startSpellCountdown() {
      clearSpellCountdown();
      let count = 1;
      if (spellCountdown) {
        spellCountdown.hidden = false;
        spellCountdownNum.textContent = String(count);
      }
      spellCountdownIntervalId = setInterval(() => {
        count--;
        if (count <= 0) {
          clearInterval(spellCountdownIntervalId);
          spellCountdownIntervalId = null;
          if (spellCountdown) spellCountdown.hidden = true;
          if (spellSt.answered) advanceSpell();
        } else {
          if (spellCountdownNum) spellCountdownNum.textContent = String(count);
        }
      }, 1000);
    }

    function clearSpellAutoSubmitTimer() {
      if (spellAutoSubmitTimerId) {
        clearTimeout(spellAutoSubmitTimerId);
        spellAutoSubmitTimerId = null;
      }
    }

    function getSpellPool() {
      const level = spellLevelSel.value;
      const pool = level === "ALL"
        ? state.cleanWords
        : (state.cleanWordsByLevel[level] || []);
      return pool.length >= 4 ? pool : state.cleanWords;
    }

    function buildSpellWords() {
      const pool = getSpellPool();
      return shuffleArray(pool).slice(0, Math.min(SPELL_TOTAL, pool.length));
    }

    function startSpell() {
      clearSpellAutoSubmitTimer();
      spellSt.words = buildSpellWords();
      spellSt.current = 0;
      spellSt.score = 0;
      spellSt.answered = false;
      spellSt.hintUsed = false;
      spellSt.hintsRevealedCount = 0;
      spellResults.classList.remove("visible");
      spellQuestion.style.display = "block";
      renderSpellQuestion();
    }

    function renderSpellQuestion() {
      clearSpellAutoSubmitTimer();
      clearSpellCountdown();
      const w = spellSt.words[spellSt.current];
      spellSt.answered = false;
      spellSt.hintUsed = false;
      spellSt.hintsRevealedCount = 0;

      spellMeta.textContent = `Word ${spellSt.current + 1} of ${spellSt.words.length}`;
      spellScoreBadge.textContent = `Score: ${spellSt.score}`;
      spellProgressFill.style.width = `${(spellSt.current / spellSt.words.length) * 100}%`;

      spellClueMeaning.textContent = w.english_meaning;
      const blankLength = w.word.length;
      const blank = "_".repeat(blankLength);
      const exRaw = w.example_sentence || "";
      const exBlanked = exRaw.replace(new RegExp(w.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), blank);
      spellClueExample.textContent = exBlanked || "-";
      spellClueLevel.textContent = w.level;
      spellCluePos.textContent = w.part_of_speech;
      spellClueLetters.textContent = `${w.word.length} letters`;
      spellSpeakBtn.dataset.word = w.word || "";
      spellSpeakBtn.disabled = false;

      buildTiles(w.word.length);
      spellCountHint.textContent = `${"-".repeat(w.word.length)} (${w.word.length} letters)`;

      spellInput.value = "";
      spellInput.disabled = false;
      spellInput.focus();
      spellFeedback.textContent = "";
      spellFeedback.className = "spell-feedback";
      spellHintUsed.textContent = "";
      spellHintBtn.disabled = false;
      spellSkipBtn.disabled = false;
      spellNextBtn.disabled = true;
    }

    function buildTiles(count) {
      spellTiles.innerHTML = "";
      activeSpellTiles = [];
      for (let i = 0; i < count; i++) {
        const div = document.createElement("div");
        div.className = "spell-tile";
        spellTiles.appendChild(div);
        activeSpellTiles.push(div);
      }
    }

    function updateTiles(typed, correctWord) {
      const len = correctWord.length;
      for (let i = 0; i < len; i++) {
        const tile = activeSpellTiles[i];
        if (!tile) continue;
        if (i < typed.length) {
          tile.textContent = typed[i].toUpperCase();
          tile.className = "spell-tile filled";
        } else {
          tile.textContent = "";
          tile.className = "spell-tile";
        }
      }
    }

    function showTileResult(typed, correctWord) {
      const len = correctWord.length;
      for (let i = 0; i < len; i++) {
        const tile = activeSpellTiles[i];
        if (!tile) continue;
        const typedChar = (typed[i] || "").toLowerCase();
        const correctChar = correctWord[i].toLowerCase();
        tile.textContent = typedChar ? typedChar.toUpperCase() : "_";
        tile.className = "spell-tile " + (typedChar === correctChar ? "correct" : "wrong");
      }
    }

    function checkSpelling() {
      if (spellSt.answered) return;
      clearSpellAutoSubmitTimer();
      const w = spellSt.words[spellSt.current];
      const typed = spellInput.value.trim().toLowerCase();
      const correct = w.word.toLowerCase();

      if (!typed) {
        spellInput.focus();
        return;
      }

      spellSt.answered = true;
      spellInput.disabled = true;
      spellHintBtn.disabled = true;
      spellSkipBtn.disabled = true;
      spellNextBtn.disabled = false;

      showTileResult(typed, w.word);

      if (typed === correct) {
        const pts = spellSt.hintUsed ? Math.max(0, 1 - (spellSt.hintsRevealedCount * 0.5)) : 1;
        spellSt.score += pts;
        spellFeedback.textContent = spellSt.hintUsed
          ? `Correct! (+${pts.toFixed(1)} pt, hint used)`
          : "Correct! Well done!";
        spellFeedback.className = "spell-feedback correct";
      } else {
        spellFeedback.textContent = `Incorrect! The word was: "${w.word}"`;
        spellFeedback.className = "spell-feedback wrong";
        for (let i = 0; i < w.word.length; i++) {
          const tile = activeSpellTiles[i];
          if (!tile) continue;
          tile.textContent = w.word[i].toUpperCase();
          tile.className = "spell-tile reveal";
        }
      }
      spellScoreBadge.textContent = `Score: ${Math.round(spellSt.score)}`;
      startSpellCountdown();
    }

    function useSpellHint() {
      if (spellSt.answered) return;
      const w = spellSt.words[spellSt.current];
      spellSt.hintUsed = true;
      spellSt.hintsRevealedCount++;
      const revealCount = spellSt.hintsRevealedCount;

      const revealed = w.word.slice(0, revealCount).toUpperCase();
      spellInput.value = w.word.slice(0, revealCount);
      updateTiles(spellInput.value, w.word);

      for (let i = 0; i < revealCount; i++) {
        const tile = activeSpellTiles[i];
        if (tile) tile.className = "spell-tile reveal";
      }

      spellHintUsed.textContent = `Hint: First ${revealCount} letter${revealCount > 1 ? "s" : ""} revealed: "${revealed}" (penalty: -${revealCount * 0.5} pts/word)`;

      if (revealCount >= Math.ceil(w.word.length / 2)) {
        spellHintBtn.disabled = true;
      }
      spellInput.focus();
    }

    function skipSpell() {
      if (spellSt.answered) return;
      clearSpellAutoSubmitTimer();
      const w = spellSt.words[spellSt.current];
      spellSt.answered = true;
      spellInput.disabled = true;
      spellHintBtn.disabled = true;
      spellSkipBtn.disabled = true;
      spellNextBtn.disabled = false;

      for (let i = 0; i < w.word.length; i++) {
        const tile = activeSpellTiles[i];
        if (tile) {
          tile.textContent = w.word[i].toUpperCase();
          tile.className = "spell-tile reveal";
        }
      }
      spellFeedback.textContent = `Skipped! The word was: "${w.word}"`;
      spellFeedback.className = "spell-feedback wrong";
      startSpellCountdown();
    }

    function advanceSpell() {
      if (!spellSt.answered) return;
      clearSpellAutoSubmitTimer();
      clearSpellCountdown();
      spellSt.current++;
      if (spellSt.current >= spellSt.words.length) {
        showSpellResults();
      } else {
        renderSpellQuestion();
      }
    }

    function showSpellResults() {
      clearSpellAutoSubmitTimer();
      const total = spellSt.words.length;
      const roundScore = Math.min(Math.round(spellSt.score), total);
      const wrong = total - roundScore;
      const pct = Math.round((roundScore / total) * 100);

      spellProgressFill.style.width = "100%";
      spellQuestion.style.display = "none";
      spellResults.classList.add("visible");

      spellFinalScore.textContent = `${Math.round(spellSt.score * 10) / 10} / ${total}`;
      spellCorrectCount.textContent = roundScore;
      spellWrongCount.textContent = wrong;
      spellAccuracy.textContent = `${pct}%`;

      const badge = pct === 100 ? "A+" : pct >= 80 ? "A" : pct >= 60 ? "B" : pct >= 40 ? "C" : "Keep Going";
      spellResultEmoji.textContent = badge;
    }

    spellInput.addEventListener("input", () => {
      if (spellSt.answered || !spellSt.words.length) return;
      const w = spellSt.words[spellSt.current];
      if (spellInput.value.length > w.word.length) {
        spellInput.value = spellInput.value.slice(0, w.word.length);
      }
      updateTiles(spellInput.value, w.word);

      clearSpellAutoSubmitTimer();
      if (spellInput.value.trim().length === w.word.length) {
        spellAutoSubmitTimerId = setTimeout(() => {
          if (!spellSt.answered) {
            checkSpelling();
          }
        }, SPELL_AUTO_SUBMIT_DELAY_MS);
      }
    });

    spellInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        if (!spellSt.answered) checkSpelling();
        else advanceSpell();
      }
    });

    spellHintBtn.addEventListener("click", useSpellHint);
    spellSkipBtn.addEventListener("click", skipSpell);
    spellNextBtn.addEventListener("click", advanceSpell);
    spellRestartBtn.addEventListener("click", startSpell);
    if (spellBackBtn) {
      spellBackBtn.addEventListener("click", () => switchMode("dictionary"));
    }
    spellPlayAgainBtn.addEventListener("click", startSpell);
    spellSpeakBtn.addEventListener("click", () => {
      speakWord(spellSpeakBtn.dataset.word || "");
    });
    tabSpell.addEventListener("click", () => switchMode("spell"));

    const _origSwitchMode = switchMode;
    switchMode = function (mode) {
      clearSpellAutoSubmitTimer();
      spellPanel.classList.remove("visible");
      tabSpell.classList.remove("active");
      if (mode === "spell") {
        if (state.allWords.length < 4) return;
        dictionaryPanel.style.display = "none";
        quizPanel.classList.remove("visible");
        spellPanel.classList.add("visible");
        tabDictionary.classList.remove("active");
        tabQuiz.classList.remove("active");
        tabSpell.classList.add("active");
        startSpell();
      } else {
        _origSwitchMode(mode);
      }
    };

    loadSavedWords();
    updateSavedToggle();
    initStreak();

    // Live visitor counter — requires Firebase config in config.js
    (function initLiveVisitors() {
      try {
        const cfg = window.APP_CONFIG && window.APP_CONFIG.firebase;
        if (!cfg || !cfg.apiKey || !cfg.databaseURL) return;
        if (typeof firebase === "undefined") return;

        const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg);
        const db = firebase.database(app);
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
    loadWords();




