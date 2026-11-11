/* Merchen Family Recipes — memory search for the gallery.
 *
 * Two layers:
 *  1. Keywords + themes (instant, no download). Broad words like "holidays" or "summer" expand to the
 *     specific words that mean them (Christmas, Easter, Halloween, June, July…), with simple stemming
 *     so "carving" finds "carved".
 *  2. Meaning ("vector") search, loaded the first time someone searches: a small sentence-embedding
 *     model (all-MiniLM-L6-v2, ~25 MB once, then cached by the browser) that runs entirely in the
 *     visitor's browser. It finds memories that are about the search even when the words differ
 *     ("cold weather" finds "Snowed in").
 *
 * Thresholds were tuned on sample family memories: a meaning score of 0.6+ counts as a match. If nothing
 * reaches that, the closest few (0.4+ and near the top score) are shown as "closest matches".
 */
(function () {
  "use strict";

  const MODEL = "Xenova/all-MiniLM-L6-v2";
  const LIB = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/dist/transformers.min.js";
  const MATCH = 0.6, CLOSE = 0.4, CLOSE_GAP = 0.08;

  // `embed` terms are compared by meaning; `words` only count as exact (stemmed) words.
  // Months and the like are words-only: the model thinks every date looks like every other date.
  const THEMES = {
    holiday: {
      embed: ["christmas", "easter", "halloween", "thanksgiving", "fourth of july", "new year's eve", "hanukkah",
        "valentine's day", "st. patrick's day", "mother's day", "father's day", "memorial day", "labor day"],
      words: ["holiday", "holidays", "xmas", "santa", "stockings", "christmas tree", "christmas eve", "easter egg",
        "egg hunt", "trick or treat", "costume", "turkey", "fireworks", "midnight", "dec 31", "new year", "new years"],
    },
    christmas: { embed: ["christmas", "santa claus"], words: ["xmas", "santa", "stockings", "christmas tree", "christmas eve"] },
    easter: { embed: ["easter"], words: ["egg hunt", "easter egg", "easter bunny"] },
    halloween: { embed: ["halloween", "trick or treating"], words: ["costume", "costumes", "pumpkin", "jack o lantern"] },
    thanksgiving: { embed: ["thanksgiving"], words: ["turkey"] },
    summer: { embed: ["summer", "summer vacation", "swimming", "fourth of july"], words: ["june", "july", "august", "pool", "beach"] },
    winter: { embed: ["winter", "snow", "christmas"], words: ["december", "january", "february", "snowed", "santa", "dec 31", "new year"] },
    fall: { embed: ["autumn", "halloween", "thanksgiving", "pumpkins", "fall leaves"], words: ["fall", "september", "october", "november", "sept", "oct", "nov"] },
    spring: { embed: ["spring", "easter", "flowers"], words: ["march", "april", "may"] },
    celebration: { embed: ["party", "birthday", "wedding", "anniversary", "graduation", "celebration", "reunion"], words: [] },
    birthday: { embed: ["birthday", "birthday party"], words: ["bday", "turned", "candles"] },
    dessert: { embed: ["dessert", "cake", "cookies", "pie", "candy"], words: ["brownies", "fudge", "ice cream", "cobbler"] },
    baby: { embed: ["baby", "newborn"], words: ["grandbaby", "born"] },
    baseball: { embed: ["baseball", "baseball game"], words: ["ballpark", "opening day", "little league", "world series", "box score", "box scores"] },
    vacation: { embed: ["vacation", "road trip", "travel"], words: ["trip", "camping", "beach", "lake"] },
  };
  const ALIASES = {
    holidays: "holiday", xmas: "christmas", autumn: "fall", celebrations: "celebration", parties: "celebration", party: "celebration",
    birthdays: "birthday", desserts: "dessert", sweets: "dessert", treats: "dessert", babies: "baby", vacations: "vacation", trips: "vacation",
  };

  const norm = s => String(s || "").toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
  const stem = w => w.replace(/'s$/, "").replace(/(ing|ed|es|s)$/, "");
  const tokens = s => norm(s).split(" ").filter(w => w.length > 2).map(stem);
  const themeFor = q => THEMES[ALIASES[q] || q] || THEMES[q.replace(/s$/, "")];

  const memoryText = m => [m.title, m.when, m.text, m.people, m.recipe, m.by].filter(Boolean).join(" ");

  // Pieces of a memory compared by meaning: title, when, people, recipe, and the story in short
  // overlapping chunks (a long story otherwise drowns out a single mention of "cake").
  function pieces(m) {
    const out = [m.title, m.when, m.people, m.recipe].filter(Boolean);
    for (const sentence of String(m.text || "").split(/(?<=[.!?])\s+/)) {
      const w = sentence.split(/\s+/).filter(Boolean);
      if (!w.length) continue;
      if (w.length <= 10) out.push(sentence);
      else for (let i = 0; i < w.length; i += 5) out.push(w.slice(i, i + 10).join(" "));
    }
    out.push([m.title, m.when, m.text].filter(Boolean).join(". ").slice(0, 600));
    return [...new Set(out.map(s => s.trim()).filter(Boolean))];
  }

  function keywordMatch(m, q) {
    const theme = themeFor(q);
    const words = [q, ...(theme ? [...theme.words, ...theme.embed] : [])];
    const txt = " " + norm(memoryText(m)) + " ";
    if (words.some(w => txt.includes(" " + w + " ") || txt.includes(" " + w + "s "))) return true;
    const qt = tokens(q), mt = new Set(tokens(txt));
    return qt.length > 0 && qt.every(t => mt.has(t));
  }

  // ── Embedding model (lazy) ──────────────────────────────────
  let embedderPromise = null;
  const memCache = new Map();
  const CACHE_KEY = "memoryVectors.v1";
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch (e) { stored = {}; }

  function loadModel() {
    if (!embedderPromise) {
      embedderPromise = import(LIB)
        .then(({ pipeline }) => pipeline("feature-extraction", MODEL, { dtype: "q8" }))
        .catch(err => { embedderPromise = null; throw err; });
    }
    return embedderPromise;
  }

  const toB64 = v => btoa(String.fromCharCode(...new Uint8Array(new Float32Array(v).buffer)));
  const fromB64 = s => Array.from(new Float32Array(Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer));
  let saveTimer = null;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const keys = Object.keys(stored);
        if (keys.length > 3000) keys.slice(0, keys.length - 3000).forEach(k => delete stored[k]);
        localStorage.setItem(CACHE_KEY, JSON.stringify(stored));
      } catch (e) { /* storage full or blocked: vectors are just recomputed next time */ }
    }, 500);
  }

  async function vectors(texts) {
    const missing = texts.filter(t => !memCache.has(t) && !stored[t]);
    if (missing.length) {
      const embed = await loadModel();
      for (let i = 0; i < missing.length; i += 16) {
        const batch = missing.slice(i, i + 16);
        const out = await embed(batch, { pooling: "mean", normalize: true });
        const dim = out.dims[out.dims.length - 1];
        batch.forEach((t, k) => {
          const v = Array.from(out.data.slice(k * dim, (k + 1) * dim));
          memCache.set(t, v);
          stored[t] = toB64(v);
        });
      }
      persist();
    }
    return texts.map(t => memCache.get(t) || (memCache.set(t, fromB64(stored[t])), memCache.get(t)));
  }

  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

  /**
   * Search memories. Returns { matches: [memory], closest: boolean, smart: boolean }.
   *  - keywordOnly: skip the model (used for the instant first pass).
   */
  async function search(memories, query, { keywordOnly = false } = {}) {
    const q = norm(query);
    if (!q) return { matches: memories.slice(), closest: false, smart: false };
    const kw = memories.filter(m => keywordMatch(m, q));
    // Years and other numbers: exact only (every year looks alike to the model).
    if (keywordOnly || /^[0-9' ]+$/.test(q)) return { matches: kw, closest: false, smart: false };

    const theme = themeFor(q);
    const qTexts = [...new Set([q, ...(theme ? theme.embed : [])])];
    const memPieces = memories.map(pieces);
    const all = await vectors([...qTexts, ...memPieces.flat()]);
    const qv = all.slice(0, qTexts.length);
    let n = qTexts.length;
    const scored = memories.map((m, i) => {
      const pv = all.slice(n, n + memPieces[i].length);
      n += memPieces[i].length;
      let best = 0;
      for (const a of qv) for (const b of pv) best = Math.max(best, dot(a, b));
      return { m, s: best, kw: kw.includes(m) };
    }).sort((a, b) => (b.kw - a.kw) || (b.s - a.s));

    let hits = scored.filter(x => x.kw || x.s >= MATCH);
    if (hits.length) return { matches: hits.map(x => x.m), closest: false, smart: true };
    const top = scored.length ? scored[0].s : 0;
    hits = scored.filter(x => x.s >= CLOSE && x.s >= top - CLOSE_GAP);
    return { matches: hits.map(x => x.m), closest: hits.length > 0, smart: true };
  }

  window.MemorySearch = { search, loadModel, keywordMatch: (m, q) => keywordMatch(m, norm(q)) };
})();
