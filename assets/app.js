/* Merchen Family Recipes — reads Google Form responses (published as CSV) and renders them. */
(function () {
  "use strict";

  const CFG = window.SITE_CONFIG || {};
  const app = document.getElementById("app");
  const state = { recipes: [], memories: [], query: "", category: "All", sort: "newest" };

  // ── Column matching ─────────────────────────────────────────
  // Each field is matched to the first unused sheet column whose header contains one of the keywords,
  // so lightly reworded form questions still work. Order matters (more specific first).
  const RECIPE_FIELDS = [
    ["timestamp", ["timestamp"]],
    ["hide", ["hide"]],
    ["title", ["recipe name", "name of the recipe", "recipe title"]],
    ["origin", ["whose recipe", "originally", "came from"]],
    ["by", ["your name", "shared by", "submitted by"]],
    ["category", ["category", "type of dish"]],
    ["story", ["story"]],
    ["ingredients", ["ingredient"]],
    ["instructions", ["instruction", "directions", "steps", "method"]],
    ["servings", ["serves", "servings", "yield"]],
    ["time", ["how long", "prep", "cook time", "total time"]],
    ["notes", ["tips", "notes"]],
    ["photo", ["photo", "picture", "image"]],
  ];
  const MEMORY_FIELDS = [
    ["timestamp", ["timestamp"]],
    ["hide", ["hide"]],
    ["title", ["short title", "title"]],
    ["by", ["your name", "shared by", "submitted by"]],
    ["recipe", ["recipe"]],
    ["people", ["who is", "who's in", "people"]],
    ["text", ["your memory", "memory", "story"]],
    ["when", ["when"]],
    ["photo", ["photo", "picture", "image"]],
  ];

  // ── CSV ─────────────────────────────────────────────────────
  function parseCSV(text) {
    const rows = [];
    let row = [], field = "", i = 0, inQuotes = false;
    text = text.replace(/^﻿/, "");
    while (i < text.length) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ",") { row.push(field); field = ""; i++; continue; }
      if (c === "\r") { i++; continue; }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(v => v.trim() !== ""));
  }

  function toObjects(rows, fields) {
    if (!rows.length) return [];
    const headers = rows[0].map(h => h.toLowerCase().trim());
    const used = new Set();
    const map = {};
    for (const [key, words] of fields) {
      const idx = headers.findIndex((h, j) => !used.has(j) && words.some(w => h.includes(w)));
      if (idx !== -1) { map[key] = idx; used.add(idx); }
    }
    return rows.slice(1).map(r => {
      const o = {};
      for (const [key] of fields) o[key] = map[key] != null ? (r[map[key]] || "").trim() : "";
      return o;
    });
  }

  // ── Helpers ─────────────────────────────────────────────────
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = s => String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
  const slugify = s => norm(s).replace(/ /g, "-") || "recipe";
  const isHidden = v => /^(y|yes|x|true|hide|hidden)$/i.test(String(v || "").trim());
  const lines = s => String(s || "").split(/\n/).map(l => l.trim()).filter(Boolean);

  function paragraphs(s) {
    return String(s || "").split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
      .map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  }

  function parseDate(s) {
    const m = String(s || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return new Date(+m[3], +m[1] - 1, +m[2], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
    const t = Date.parse(s);
    return isNaN(t) ? 0 : t;
  }

  // Google Forms file uploads come through as Drive links; turn them into embeddable images.
  function photoUrls(s) {
    return String(s || "").split(/[,\s]+/).map(u => u.trim()).filter(Boolean).map(u => {
      const id = (u.match(/[?&]id=([\w-]+)/) || u.match(/\/d\/([\w-]+)/) || [])[1];
      if (id && /drive\.google|docs\.google/.test(u)) return `https://drive.google.com/thumbnail?id=${id}&sz=w1600`;
      return /^https?:\/\//.test(u) ? u : null;
    }).filter(Boolean);
  }

  const PALETTE = ["#b5532f", "#6b7f5e", "#a0763c", "#7a5a7e", "#4f7486", "#9c4a55", "#5f6b3a", "#8a6a4f"];
  function colorFor(s) {
    let h = 0;
    for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }

  function csvUrl(gid, sample) {
    const pub = (CFG.publishedSheetUrl || "").trim();
    if (!pub) return sample;
    const id = (pub.match(/\/d\/e\/([\w-]+)/) || [])[1];
    if (!id) throw new Error("publishedSheetUrl in config.js doesn't look like a 'Publish to web' link.");
    return `https://docs.google.com/spreadsheets/d/e/${id}/pub?gid=${encodeURIComponent(gid || "0")}&single=true&output=csv`;
  }

  async function fetchCSV(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Couldn't load ${url} (${res.status})`);
    return parseCSV(await res.text());
  }

  function memoryFormLink(recipeTitle) {
    if (!CFG.memoryFormUrl) return "";
    if (!recipeTitle || !CFG.memoryFormRecipeEntry) return CFG.memoryFormUrl;
    const sep = CFG.memoryFormUrl.includes("?") ? "&" : "?";
    return `${CFG.memoryFormUrl}${sep}usp=pp_url&${CFG.memoryFormRecipeEntry}=${encodeURIComponent(recipeTitle)}`;
  }

  // ── Data loading ────────────────────────────────────────────
  async function load() {
    const usingSample = !(CFG.publishedSheetUrl || "").trim();
    if (usingSample) showNotice("Showing sample recipes. Connect your Google Forms in config.js to show your family's own (see README).");

    let sheetErr = null;
    const [rRows, mRows, familyRows] = await Promise.all([
      fetchCSV(csvUrl(CFG.recipesGid, "data/sample-recipes.csv")).catch(err => { sheetErr = err; return []; }),
      fetchCSV(csvUrl(CFG.memoriesGid, "data/sample-memories.csv")).catch(err => { console.warn(err); return []; }),
      // Recipes typed up from the family's paper copies live in the repo, alongside form submissions.
      usingSample ? [] : fetchCSV("data/family-recipes.csv").catch(err => { console.warn(err); return []; }),
    ]);

    if (sheetErr && !familyRows.length) throw sheetErr;
    if (sheetErr) console.warn(sheetErr);

    const seen = {};
    state.recipes = [...toObjects(rRows, RECIPE_FIELDS), ...toObjects(familyRows, RECIPE_FIELDS)]
      .filter(r => r.title && !isHidden(r.hide))
      .map(r => {
        let slug = slugify(r.title);
        seen[slug] = (seen[slug] || 0) + 1;
        if (seen[slug] > 1) slug += "-" + seen[slug];
        return { ...r, slug, ts: parseDate(r.timestamp), category: r.category || "Other", photos: photoUrls(r.photo) };
      });

    state.memories = toObjects(mRows, MEMORY_FIELDS)
      .filter(m => m.text && !isHidden(m.hide))
      .map(m => ({ ...m, ts: parseDate(m.timestamp), photos: photoUrls(m.photo) }))
      .sort((a, b) => b.ts - a.ts);

    // Link each memory to a recipe when the recipe name roughly matches.
    for (const m of state.memories) {
      const q = norm(m.recipe);
      if (q.length < 3) continue;
      m.linked = state.recipes.find(r => norm(r.title) === q)
        || state.recipes.find(r => { const t = norm(r.title); return t.includes(q) || q.includes(t); });
    }
  }

  function showNotice(text) {
    const n = document.getElementById("notice");
    n.textContent = text;
    n.hidden = false;
  }

  // ── Views ───────────────────────────────────────────────────
  function cardImage(item, label) {
    if (item.photos && item.photos[0]) return `<img src="${esc(item.photos[0])}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
    return `<div class="placeholder" style="background:${colorFor(item.category || label)}">${esc((label || "?").charAt(0).toUpperCase())}</div>`;
  }

  function recipeCard(r) {
    const who = [r.origin && `From ${r.origin}`, r.by && `shared by ${r.by}`].filter(Boolean).join(" · ");
    return `<a class="card" href="#/recipe/${esc(r.slug)}">
      <div class="card-img">${cardImage(r, r.title)}</div>
      <div class="card-body">
        <div class="tag">${esc(r.category)}</div>
        <h3>${esc(r.title)}</h3>
        ${who ? `<div class="meta">${esc(who)}</div>` : ""}
      </div></a>`;
  }

  function memoryCard(m, { showRecipe = true } = {}) {
    const meta = [m.by && `— ${m.by}`, m.when, m.people && `with ${m.people}`].filter(Boolean).join(" · ");
    return `<article class="memory">
      ${m.photos.map(p => `<img src="${esc(p)}" alt="" loading="lazy" referrerpolicy="no-referrer">`).join("")}
      <div class="memory-body">
        ${m.title ? `<h3>${esc(m.title)}</h3>` : ""}
        <div class="memory-text">${paragraphs(m.text)}</div>
        ${meta ? `<div class="meta">${esc(meta)}</div>` : ""}
        ${showRecipe && m.linked ? `<a class="recipe-link" href="#/recipe/${esc(m.linked.slug)}">🍽 ${esc(m.linked.title)} →</a>` : ""}
      </div></article>`;
  }

  function renderHome() {
    const cats = ["All", ...Array.from(new Set(state.recipes.map(r => r.category))).sort()];
    app.innerHTML = `
      <section class="hero">
        <h1>${esc(CFG.siteTitle || "Family Recipes")}</h1>
        <p>${esc(CFG.tagline || "")}</p>
        <div class="hero-actions">
          ${CFG.recipeFormUrl ? `<a class="btn" href="${esc(CFG.recipeFormUrl)}" target="_blank" rel="noopener">＋ Add a recipe</a>` : ""}
          ${CFG.memoryFormUrl ? `<a class="btn btn-ghost" href="${esc(CFG.memoryFormUrl)}" target="_blank" rel="noopener">Share a memory</a>` : ""}
        </div>
      </section>
      <div class="toolbar">
        <input class="search" type="search" placeholder="Search recipes, ingredients, people…" value="${esc(state.query)}" aria-label="Search recipes">
        <select aria-label="Sort recipes">
          <option value="newest"${state.sort === "newest" ? " selected" : ""}>Newest first</option>
          <option value="az"${state.sort === "az" ? " selected" : ""}>A to Z</option>
        </select>
      </div>
      <div class="chips">${cats.map(c => `<button class="chip" aria-pressed="${c === state.category}" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}</div>
      <div id="results"></div>
      ${state.memories.length ? `
        <h2 class="section-title">Recent memories</h2>
        <div class="memories">${state.memories.slice(0, 3).map(m => memoryCard(m)).join("")}</div>
        <p><a href="#/memories">See all memories →</a></p>` : ""}`;

    const search = app.querySelector(".search");
    search.addEventListener("input", e => { state.query = e.target.value; renderResults(); });
    app.querySelector("select").addEventListener("change", e => { state.sort = e.target.value; renderResults(); });
    app.querySelectorAll(".chip").forEach(b => b.addEventListener("click", () => {
      state.category = b.dataset.cat;
      app.querySelectorAll(".chip").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      renderResults();
    }));
    renderResults();
  }

  function renderResults() {
    const q = norm(state.query);
    let list = state.recipes.filter(r =>
      (state.category === "All" || r.category === state.category) &&
      (!q || norm([r.title, r.origin, r.by, r.category, r.ingredients, r.story].join(" ")).includes(q)));
    list = list.slice().sort(state.sort === "az" ? (a, b) => a.title.localeCompare(b.title) : (a, b) => b.ts - a.ts);
    const el = document.getElementById("results");
    el.innerHTML = list.length
      ? `<div class="grid">${list.map(recipeCard).join("")}</div>`
      : `<p class="empty">${state.recipes.length ? "No recipes match that search." : "No recipes yet. Be the first to add one!"}</p>`;
  }

  function renderRecipe(slug) {
    const r = state.recipes.find(x => x.slug === slug);
    if (!r) { app.innerHTML = `<p class="empty">We couldn't find that recipe. <a href="#/">Back to all recipes</a></p>`; return; }
    document.title = `${r.title} · ${CFG.siteTitle || "Family Recipes"}`;

    const facts = [
      r.origin && `<span>From <strong>${esc(r.origin)}</strong></span>`,
      r.by && `<span>Shared by <strong>${esc(r.by)}</strong></span>`,
      r.servings && `<span>Serves <strong>${esc(r.servings)}</strong></span>`,
      r.time && `<span>Time <strong>${esc(r.time)}</strong></span>`,
    ].filter(Boolean).join("");

    const ingredients = lines(r.ingredients).map((l, i) => {
      const clean = l.replace(/^[-*•]\s*/, "");
      if (/^#/.test(clean) || /:$/.test(clean)) return `<li class="subhead">${esc(clean.replace(/^#+\s*/, ""))}</li>`;
      return `<li><label><input type="checkbox" id="ing-${i}"><span>${esc(clean)}</span></label></li>`;
    }).join("");

    const steps = lines(r.instructions)
      .map(l => l.replace(/^(step\s*\d+\s*[:.)-]?|\d+\s*[.):-]|[-*•])\s*/i, ""))
      .filter(Boolean).map(l => `<li>${esc(l)}</li>`).join("");

    const mems = state.memories.filter(m => m.linked === r);
    const shareLink = memoryFormLink(r.title);

    app.innerHTML = `
      <a class="back" href="#/">← All recipes</a>
      <div class="recipe-head">
        <div class="tag">${esc(r.category)}</div>
        <h1>${esc(r.title)}</h1>
        <div class="facts">${facts}</div>
      </div>
      ${r.photos.length ? `<div class="photos">${r.photos.map(p => `<img src="${esc(p)}" alt="${esc(r.title)}" referrerpolicy="no-referrer">`).join("")}</div>` : ""}
      ${r.story ? `<blockquote class="story">${paragraphs(r.story)}</blockquote>` : ""}
      <div class="recipe-cols">
        <section class="panel"><h2>Ingredients</h2><ul class="ingredients">${ingredients || "<li>—</li>"}</ul></section>
        <section class="panel"><h2>Instructions</h2><ol class="steps">${steps || "<li>—</li>"}</ol>
          ${r.notes ? `<div class="notes"><h3>Notes &amp; tips</h3>${paragraphs(r.notes)}</div>` : ""}
        </section>
      </div>
      <div class="recipe-actions">
        <button class="btn btn-ghost" onclick="window.print()">🖨 Print recipe</button>
        ${shareLink ? `<a class="btn btn-ghost" href="${esc(shareLink)}" target="_blank" rel="noopener">Share a memory about this recipe</a>` : ""}
      </div>
      ${mems.length ? `<h2 class="section-title">Memories</h2><div class="memories card-memories">${mems.map(m => memoryCard(m, { showRecipe: false })).join("")}</div>` : ""}`;
    window.scrollTo(0, 0);
  }

  function renderMemories() {
    app.innerHTML = `
      <section class="hero">
        <h1>Memories</h1>
        <p>Stories, moments and people from around the table.</p>
        ${CFG.memoryFormUrl ? `<div class="hero-actions"><a class="btn" href="${esc(CFG.memoryFormUrl)}" target="_blank" rel="noopener">Share a memory</a></div>` : ""}
      </section>
      ${state.memories.length
        ? `<div class="memories">${state.memories.map(m => memoryCard(m)).join("")}</div>`
        : `<p class="empty">No memories yet. Be the first to share one!</p>`}`;
  }

  function renderShare() {
    const missing = `<p><em>The form link hasn't been set up yet.</em></p>`;
    app.innerHTML = `
      <section class="hero"><h1>Share with the family</h1><p>Pick one. It only takes a few minutes, and it'll show up here shortly after.</p></section>
      <div class="share">
        <div class="panel"><div class="emoji">🥘</div><h2>Add a recipe</h2>
          <p>A family favorite, a holiday tradition, or the dish everyone asks you to bring.</p>
          ${CFG.recipeFormUrl ? `<a class="btn" href="${esc(CFG.recipeFormUrl)}" target="_blank" rel="noopener">Open recipe form</a>` : missing}</div>
        <div class="panel"><div class="emoji">📷</div><h2>Share a memory</h2>
          <p>A story, a photo, a moment in the kitchen. It doesn't have to be about food.</p>
          ${CFG.memoryFormUrl ? `<a class="btn" href="${esc(CFG.memoryFormUrl)}" target="_blank" rel="noopener">Open memory form</a>` : missing}</div>
      </div>`;
  }

  // ── Router ──────────────────────────────────────────────────
  function route() {
    const hash = location.hash.replace(/^#\/?/, "");
    const [page, arg] = hash.split("/");
    document.title = CFG.siteTitle || "Family Recipes";
    document.querySelectorAll("[data-nav]").forEach(a =>
      a.classList.toggle("active", (a.dataset.nav === "memories") === (page === "memories") && page !== "share"));
    if (page === "recipe") renderRecipe(decodeURIComponent(arg || ""));
    else if (page === "memories") renderMemories();
    else if (page === "share") renderShare();
    else renderHome();
    if (page !== "recipe") window.scrollTo(0, 0);
  }

  document.getElementById("site-title").textContent = CFG.siteTitle || "Family Recipes";
  load()
    .then(() => { window.addEventListener("hashchange", route); route(); })
    .catch(err => {
      console.error(err);
      app.innerHTML = `<p class="empty">Sorry, the recipes couldn't be loaded right now.<br><small>${esc(err.message)}</small></p>`;
    });
})();
