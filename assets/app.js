/* Merchen Family Recipes — reads Google Form responses (published as CSV) and renders them. */
(function () {
  "use strict";

  const CFG = window.SITE_CONFIG || {};
  const app = document.getElementById("app");
  const state = { recipes: [], memories: [], comments: [], covers: [], seen: {}, apiVersion: 0, query: "", category: "All", sort: "newest" };

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
    const [rRows, mRows, familyRows, site] = await Promise.all([
      fetchCSV(csvUrl(CFG.recipesGid, "data/sample-recipes.csv")).catch(err => { sheetErr = err; return []; }),
      fetchCSV(csvUrl(CFG.memoriesGid, "data/sample-memories.csv")).catch(err => { console.warn(err); return []; }),
      // Recipes typed up from the family's paper copies live in the repo, alongside form submissions.
      usingSample ? [] : fetchCSV("data/family-recipes.csv").catch(err => { console.warn(err); return []; }),
      loadSite(),
    ]);
    state.apiVersion = site.version;
    state.comments = site.comments.map(prepItem);
    state.covers = site.covers.map(prepItem);

    if (sheetErr && !familyRows.length) throw sheetErr;
    if (sheetErr) console.warn(sheetErr);

    state.recipes = [...toObjects(rRows, RECIPE_FIELDS), ...toObjects(familyRows, RECIPE_FIELDS)]
      .filter(r => r.title && !isHidden(r.hide))
      .concat(site.recipes.map(prepItem).filter(r => r.title))
      .map(makeRecipe);

    state.memories = toObjects(mRows, MEMORY_FIELDS)
      .filter(m => m.text && !isHidden(m.hide))
      .map(m => ({ ...m, ts: parseDate(m.timestamp), photos: photoUrls(m.photo) }))
      .concat(site.memories.map(prepItem).filter(m => m.text))
      .map(linkMemory)
      .sort((a, b) => b.ts - a.ts);
  }

  // ── Site backend (Apps Script web app, see google/comments-backend.gs) ──
  // Version 1 of the script only handled comments. Version 2 adds recipes, memories and cover photos;
  // until it's deployed, "add a recipe/memory" falls back to the Google Forms.
  async function loadSite() {
    const empty = { version: 0, comments: [], recipes: [], memories: [], covers: [] };
    if (!CFG.commentsApiUrl) return empty;
    try {
      const res = await fetch(CFG.commentsApiUrl, { cache: "no-store" });
      const d = await res.json();
      return { version: d.version || 1, comments: d.comments || [], recipes: d.recipes || [], memories: d.memories || [], covers: d.covers || [] };
    } catch (err) {
      console.warn("Site data couldn't be loaded", err);
      return empty;
    }
  }

  const canPost = () => state.apiVersion >= 2;

  function prepItem(c) {
    return { ...c, ts: +c.ts || 0, photos: photoUrls((c.photos || []).join(" ")) };
  }

  async function postApi(payload) {
    const res = await fetch(CFG.commentsApiUrl, { method: "POST", body: JSON.stringify(payload) });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Something went wrong.");
    const item = data.item || data.comment;
    return item ? prepItem(item) : null;
  }

  const commentsFor = r => state.comments.filter(c => c.recipeId === r.slug).sort((a, b) => a.ts - b.ts);
  const allPhotos = r => [...new Set([...r.photos, ...commentsFor(r).flatMap(c => c.photos)])];
  function coverOf(r) {
    const chosen = state.covers.filter(c => c.recipeId === r.slug && c.photos[0]).sort((a, b) => b.ts - a.ts)[0];
    return chosen ? chosen.photos[0] : allPhotos(r)[0] || "";
  }

  // Shrink photos in the browser before upload: phone pictures are huge, and this keeps uploads fast.
  function shrinkImage(file, maxSide = 1800, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve({ type: "image/jpeg", data: canvas.toDataURL("image/jpeg", quality).split(",")[1] });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Couldn't read ${file.name}. Try a JPEG or PNG.`)); };
      img.src = url;
    });
  }

  function savedName() { try { return localStorage.getItem("commenterName") || ""; } catch (e) { return ""; } }
  function saveName(n) { try { localStorage.setItem("commenterName", n); } catch (e) { /* private mode */ } }

  // ── Form building blocks ────────────────────────────────────
  const field = (label, input, hint = "") =>
    `<label><span>${label}${hint ? ` <span class="muted">${hint}</span>` : ""}</span>${input}</label>`;
  const nameField = () => field("Your name", `<input name="name" required maxlength="100" autocomplete="name" value="${esc(savedName())}">`);
  const photoField = (label, multiple = true) =>
    `<div class="photo-field"><label class="photo-pick">📷 ${label}<input name="photos" type="file" accept="image/*"${multiple ? " multiple" : ""}></label><div class="previews"></div></div>`;
  const submitRow = (label, extra = "") =>
    `<input name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
     <div class="form-row"><button class="btn" type="submit">${label}</button>${extra}<span class="status" role="status"></span></div>`;

  // Wires the photo field inside `form`. Returns a function that gives the chosen files.
  function photoPicker(form, max = 6, onChange = () => {}) {
    const input = form.querySelector("input[type=file]");
    const previews = form.querySelector(".previews");
    let files = [];
    const show = () => {
      previews.innerHTML = files.map((f, i) =>
        `<div class="preview"><img src="${URL.createObjectURL(f)}" alt=""><button type="button" data-i="${i}" aria-label="Remove photo">×</button></div>`).join("");
      previews.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { files.splice(+b.dataset.i, 1); show(); onChange(files); }));
    };
    input.addEventListener("change", () => {
      const picked = [...input.files].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|gif|webp|heic)$/i.test(f.name));
      files = (max === 1 ? picked : [...files, ...picked]).slice(0, max);
      input.value = "";
      show();
      onChange(files);
    });
    return { files: () => files, clear: () => { files = []; show(); } };
  }

  // Common submit handling: name check, honeypot, shrinking photos, status messages.
  // `build(name, photos)` returns the payload (or throws a friendly Error); `done(item)` runs on success.
  function wireForm(form, { files = () => [], build, done, busy = "Saving…" }) {
    const status = form.querySelector(".status");
    const btn = form.querySelector("button[type=submit]");
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const name = form.elements.name.value.trim();
      if (!name) { status.textContent = "Please add your name."; form.elements.name.focus(); return; }
      btn.disabled = true;
      try {
        const chosen = files();
        status.textContent = chosen.length ? "Uploading photos…" : busy;
        const photos = await Promise.all(chosen.map(f => shrinkImage(f)));
        const payload = build(name, photos);
        const item = await postApi({ ...payload, name, website: form.elements.website.value });
        saveName(name);
        done(item);
      } catch (err) {
        console.error(err);
        status.textContent = err.friendly ? err.message : `Sorry, that didn't save: ${err.message}`;
        btn.disabled = false;
      }
    });
  }
  const friendly = msg => Object.assign(new Error(msg), { friendly: true });

  // ── Comments ────────────────────────────────────────────────
  function commentHTML(c) {
    const when = c.ts ? new Date(c.ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
    return `<article class="comment">
      <div class="comment-head"><strong>${esc(c.name || "Someone")}</strong>${when ? `<span>${esc(when)}</span>` : ""}</div>
      ${c.text ? `<div class="comment-text">${paragraphs(c.text)}</div>` : ""}
      ${c.photos.length ? `<div class="comment-photos">${c.photos.map(p =>
        `<a href="${esc(p)}" target="_blank" rel="noopener"><img src="${esc(p)}" alt="Photo from ${esc(c.name)}" loading="lazy" referrerpolicy="no-referrer"></a>`).join("")}</div>` : ""}
    </article>`;
  }

  function commentsSection(r) {
    if (!CFG.commentsApiUrl) return "";
    const list = commentsFor(r);
    return `
      <section class="comments" id="comments">
        <h2 class="section-title">Comments &amp; photos</h2>
        <div class="comment-list">${list.length ? list.map(commentHTML).join("") : `<p class="muted">No comments yet. Made this one? Tell us how it went, or add a photo.</p>`}</div>
        <form class="panel site-form comment-form" novalidate>
          <h3>Add a comment or photos</h3>
          ${nameField()}
          ${field("Comment", `<textarea name="text" rows="3" maxlength="4000" placeholder="Made this for Sunday dinner…"></textarea>`, "(optional if you're adding photos)")}
          ${photoField("Add photos")}
          ${submitRow("Post")}
        </form>
      </section>`;
  }

  function wireCommentForm(r) {
    const form = app.querySelector(".comment-form");
    if (!form) return;
    const picker = photoPicker(form);
    wireForm(form, {
      files: picker.files,
      busy: "Posting…",
      build: (name, photos) => {
        const text = form.elements.text.value.trim();
        if (!text && !photos.length) throw friendly("Add a comment or a photo.");
        return { action: "comment", recipeId: r.slug, recipe: r.title, text, photos };
      },
      done: item => {
        if (item) state.comments.push(item);
        renderRecipe(r.slug, { keepScroll: true });
        const s = app.querySelector(".comment-form .status");
        if (s) s.textContent = "Thanks! It's posted.";
      },
    });
  }

  // ── Cover photo ─────────────────────────────────────────────
  function coverSection(r) {
    const cover = coverOf(r);
    if (!cover && !canPost()) return "";
    const pastCovers = state.covers.filter(c => c.recipeId === r.slug).flatMap(c => c.photos);
    const others = [...new Set([...allPhotos(r), ...pastCovers])].filter(p => p !== cover);
    return `
      <div class="cover${cover ? "" : " cover-empty"}">
        ${cover
          ? `<img src="${esc(cover)}" alt="${esc(r.title)}" referrerpolicy="no-referrer">`
          : `<div class="placeholder" style="background:${colorFor(r.category || r.title)}"></div>`}
        ${canPost() ? `<button class="btn btn-small cover-btn" type="button" aria-expanded="false">${cover ? "📷 Change cover photo" : "＋ Add a cover photo"}</button>` : ""}
      </div>
      ${canPost() ? `
      <form class="panel site-form cover-form" novalidate hidden>
        <h3>${cover ? "Change the cover photo" : "Add a cover photo"}</h3>
        ${nameField()}
        ${others.length ? `
          <div><span class="label">Pick a photo already on this recipe</span>
            <div class="pick-grid">${others.map(p => `<button type="button" class="pick" data-photo="${esc(p)}" aria-pressed="false"><img src="${esc(p)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`).join("")}</div>
          </div>
          <span class="muted">or upload a new one:</span>` : ""}
        ${photoField(others.length ? "Upload a photo" : "Choose a photo", false)}
        ${submitRow("Save cover", `<button class="btn btn-ghost cover-cancel" type="button">Cancel</button>`)}
      </form>` : ""}`;
  }

  function wireCover(r) {
    const form = app.querySelector(".cover-form");
    if (!form) return;
    const toggle = app.querySelector(".cover-btn");
    const setOpen = open => {
      form.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      if (open) form.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
    toggle.addEventListener("click", () => setOpen(form.hidden));
    form.querySelector(".cover-cancel").addEventListener("click", () => setOpen(false));

    let existing = "";
    const picks = [...form.querySelectorAll(".pick")];
    const picker = photoPicker(form, 1, files => {
      if (files.length) { existing = ""; picks.forEach(p => p.setAttribute("aria-pressed", "false")); }
    });
    picks.forEach(b => b.addEventListener("click", () => {
      existing = b.getAttribute("aria-pressed") === "true" ? "" : b.dataset.photo;
      picks.forEach(p => p.setAttribute("aria-pressed", String(p === b && !!existing)));
      if (existing) picker.clear();
    }));
    wireForm(form, {
      files: picker.files,
      build: (name, photos) => {
        if (!existing && !photos.length) throw friendly("Pick or upload a photo.");
        return { action: "cover", recipeId: r.slug, recipe: r.title, existingPhoto: existing, photos };
      },
      done: item => {
        if (item) state.covers.push(item);
        renderRecipe(r.slug);
      },
    });
  }

  // ── Recipe and memory objects ───────────────────────────────
  function makeRecipe(r) {
    let slug = slugify(r.title);
    state.seen[slug] = (state.seen[slug] || 0) + 1;
    if (state.seen[slug] > 1) slug += "-" + state.seen[slug];
    return { ...r, slug, ts: r.ts || parseDate(r.timestamp), category: r.category || "Other", photos: r.photos || photoUrls(r.photo) };
  }

  function linkMemory(m) {
    const q = norm(m.recipe);
    if (q.length < 3) return m;
    m.linked = state.recipes.find(r => norm(r.title) === q)
      || state.recipes.find(r => { const t = norm(r.title); return t.includes(q) || q.includes(t); });
    return m;
  }

  // Where "add a recipe / memory" buttons go: the site's own forms, or the Google Forms as a fallback.
  function addLink(kind, label, cls = "btn", recipe) {
    if (canPost()) return `<a class="${cls}" href="#/add-${kind}${recipe ? "/" + esc(recipe.slug) : ""}">${label}</a>`;
    const url = kind === "recipe" ? CFG.recipeFormUrl : memoryFormLink(recipe && recipe.title);
    return url ? `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener">${label}</a>` : "";
  }

  const CATEGORIES = ["Breakfast", "Appetizers & Snacks", "Soups & Salads", "Mains", "Sides", "Breads", "Desserts", "Drinks", "Holidays", "Other"];

  function renderAddRecipe() {
    if (!canPost()) { location.hash = "#/share"; return; }
    const cats = [...new Set([...CATEGORIES, ...state.recipes.map(r => r.category)])];
    app.innerHTML = `
      <a class="back" href="#/">← All recipes</a>
      <section class="hero hero-left"><h1>Add a recipe</h1><p>A family favorite, a holiday tradition, or the dish everyone asks you to bring.</p></section>
      <form class="panel site-form add-form" novalidate>
        ${field("Recipe name", `<input name="title" required maxlength="200" placeholder="Grandma's Sunday Pot Roast">`)}
        <div class="two">
          ${nameField()}
          ${field("Whose recipe is it originally?", `<input name="origin" maxlength="200" placeholder="Grandma Ruth, Uncle Joe, or &quot;mine!&quot;">`)}
        </div>
        ${field("Category", `<select name="category">${cats.map(c => `<option${c === "Other" ? " selected" : ""}>${esc(c)}</option>`).join("")}</select>`)}
        ${field("The story behind it", `<textarea name="story" rows="3" placeholder="Where did it come from? When do you make it?"></textarea>`, "(optional)")}
        ${field("Ingredients", `<textarea name="ingredients" rows="8" required placeholder="2 cups flour&#10;1 tsp. salt&#10;For the frosting:&#10;1 cup powdered sugar"></textarea>`, "(one per line; end a line with a colon to make a heading)")}
        ${field("Instructions", `<textarea name="instructions" rows="8" required placeholder="Preheat oven to 350°.&#10;Mix the dry ingredients."></textarea>`, "(one step per line)")}
        <div class="two">
          ${field("Servings", `<input name="servings" maxlength="100" placeholder="8">`, "(optional)")}
          ${field("How long does it take?", `<input name="time" maxlength="100" placeholder="1 hour">`, "(optional)")}
        </div>
        ${field("Notes &amp; tips", `<textarea name="notes" rows="3"></textarea>`, "(optional)")}
        ${photoField("Add photos (the first one becomes the cover)")}
        ${submitRow("Add recipe")}
      </form>`;
    const form = app.querySelector(".add-form");
    const picker = photoPicker(form);
    wireForm(form, {
      files: picker.files,
      build: (name, photos) => {
        const v = k => form.elements[k].value.trim();
        if (!v("title")) throw friendly("Please add the recipe name.");
        if (!v("ingredients")) throw friendly("Please add the ingredients.");
        if (!v("instructions")) throw friendly("Please add the instructions.");
        return { action: "recipe", photos, ...Object.fromEntries(["title", "origin", "category", "story", "ingredients", "instructions", "servings", "time", "notes"].map(k => [k, v(k)])) };
      },
      done: item => {
        const r = makeRecipe(item);
        state.recipes.push(r);
        location.hash = `#/recipe/${r.slug}`;
      },
    });
    window.scrollTo(0, 0);
  }

  function renderAddMemory(slug) {
    if (!canPost()) { location.hash = "#/share"; return; }
    const pre = state.recipes.find(r => r.slug === slug);
    const titles = [...state.recipes].sort((a, b) => a.title.localeCompare(b.title));
    app.innerHTML = `
      <a class="back" href="${pre ? `#/recipe/${esc(pre.slug)}` : "#/memories"}">← ${pre ? esc(pre.title) : "All memories"}</a>
      <section class="hero hero-left"><h1>Share a memory</h1><p>A story, a photo, a moment in the kitchen. It doesn't have to be about food.</p></section>
      <form class="panel site-form add-form" novalidate>
        ${field("Your memory", `<textarea name="text" rows="6" required placeholder="Every Christmas Eve…"></textarea>`)}
        <div class="two">
          ${nameField()}
          ${field("A short title", `<input name="title" maxlength="200" placeholder="Flour on the ceiling">`, "(optional)")}
        </div>
        ${field("Which recipe is it about?", `<select name="recipe"><option value="">None in particular</option>${titles.map(r => `<option${pre === r ? " selected" : ""}>${esc(r.title)}</option>`).join("")}</select>`, "(optional)")}
        <div class="two">
          ${field("Who's in it?", `<input name="people" maxlength="300" placeholder="Grandma, Dad, the cousins">`, "(optional)")}
          ${field("When was it?", `<input name="when" maxlength="100" placeholder="Christmas 1994">`, "(optional)")}
        </div>
        ${photoField("Add photos")}
        ${submitRow("Share memory")}
      </form>`;
    const form = app.querySelector(".add-form");
    const picker = photoPicker(form);
    wireForm(form, {
      files: picker.files,
      build: (name, photos) => {
        const v = k => form.elements[k].value.trim();
        if (!v("text")) throw friendly("Please write your memory.");
        return { action: "memory", photos, ...Object.fromEntries(["text", "title", "recipe", "people", "when"].map(k => [k, v(k)])) };
      },
      done: item => {
        const m = linkMemory({ ...item, by: item.by || "" });
        state.memories.unshift(m);
        location.hash = m.linked ? `#/recipe/${m.linked.slug}` : "#/memories";
      },
    });
    window.scrollTo(0, 0);
  }

  function showNotice(text) {
    const n = document.getElementById("notice");
    n.textContent = text;
    n.hidden = false;
  }

  // ── Views ───────────────────────────────────────────────────
  function cardImage(item, label) {
    const photo = item.slug ? coverOf(item) : item.photos && item.photos[0];
    if (photo) return `<img src="${esc(photo)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
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
      ${m.photos.map(p => {
        const k = gallerySlides().findIndex(s => s.m === m && s.src === p);
        const img = `<img src="${esc(p)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
        return k < 0 ? img : `<a class="memory-photo" href="#/gallery/${k}" aria-label="Open in gallery">${img}</a>`;
      }).join("")}
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
          ${addLink("recipe", "＋ Add a recipe")}
          ${addLink("memory", "Share a memory", "btn btn-ghost")}
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

  function renderRecipe(slug, { keepScroll = false } = {}) {
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
    const cover = coverOf(r);
    const gallery = r.photos.filter(p => p !== cover);

    app.innerHTML = `
      <a class="back" href="#/">← All recipes</a>
      <div class="recipe-head">
        <div class="tag">${esc(r.category)}</div>
        <h1>${esc(r.title)}</h1>
        <div class="facts">${facts}</div>
      </div>
      ${coverSection(r)}
      ${gallery.length ? `<div class="photos">${gallery.map(p => `<img src="${esc(p)}" alt="${esc(r.title)}" referrerpolicy="no-referrer">`).join("")}</div>` : ""}
      ${r.story ? `<blockquote class="story">${paragraphs(r.story)}</blockquote>` : ""}
      <div class="recipe-cols">
        <section class="panel"><h2>Ingredients</h2><ul class="ingredients">${ingredients || "<li>—</li>"}</ul></section>
        <section class="panel"><h2>Instructions</h2><ol class="steps">${steps || "<li>—</li>"}</ol>
          ${r.notes ? `<div class="notes"><h3>Notes &amp; tips</h3>${paragraphs(r.notes)}</div>` : ""}
        </section>
      </div>
      <div class="recipe-actions">
        <button class="btn btn-ghost" onclick="window.print()">🖨 Print recipe</button>
        ${CFG.commentsApiUrl ? `<a class="btn btn-ghost" href="#comments" onclick="document.getElementById('comments').scrollIntoView({behavior:'smooth'});return false;">💬 Comments &amp; photos${commentsFor(r).length ? ` (${commentsFor(r).length})` : ""}</a>` : ""}
        ${addLink("memory", "Share a memory about this recipe", "btn btn-ghost", r)}
      </div>
      ${mems.length ? `<h2 class="section-title">Memories</h2><div class="memories card-memories">${mems.map(m => memoryCard(m, { showRecipe: false })).join("")}</div>` : ""}
      ${commentsSection(r)}`;
    wireCommentForm(r);
    wireCover(r);
    if (!keepScroll) window.scrollTo(0, 0);
  }

  function renderMemories() {
    app.innerHTML = `
      <section class="hero">
        <h1>Memories</h1>
        <p>Stories, moments and people from around the table.</p>
        <div class="hero-actions">${addLink("memory", "Share a memory")}${gallerySlides().length ? `<a class="btn btn-ghost" href="#/gallery">▶ Photo slideshow</a>` : ""}</div>
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
          ${addLink("recipe", "Add a recipe") || missing}</div>
        <div class="panel"><div class="emoji">📷</div><h2>Share a memory</h2>
          <p>A story, a photo, a moment in the kitchen. It doesn't have to be about food.</p>
          ${addLink("memory", "Share a memory") || missing}</div>
      </div>`;
  }

  // ── Photo gallery (slideshow of memory photos) ──────────────
  const SLIDE_MS = 6000;
  let galleryCleanup = null;

  const gallerySlides = () => state.memories.flatMap(m => m.photos.map(src => ({ src, m })));

  function renderGallery(startArg) {
    const slides = gallerySlides();
    if (!slides.length) {
      app.innerHTML = `
        <section class="hero"><h1>Gallery</h1><p>Photos from the family's memories will show up here as a slideshow.</p>
          <div class="hero-actions">${addLink("memory", "Share a memory with a photo")}</div></section>`;
      return;
    }
    let i = Math.min(Math.max(parseInt(startArg, 10) || 0, 0), slides.length - 1);
    let playing = !/^\d+$/.test(startArg || "");  // opened from a specific photo: start paused on it
    let timer = null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const caption = s => {
      const m = s.m;
      const meta = [m.by && `${m.by}`, m.when, m.people && `with ${m.people}`].filter(Boolean).join(" · ");
      return `
        ${m.title ? `<h2>${esc(m.title)}</h2>` : ""}
        ${m.text ? `<p class="g-text">${esc(m.text)}</p>` : ""}
        ${meta ? `<div class="g-meta">${esc(meta)}</div>` : ""}
        ${m.linked ? `<a href="#/recipe/${esc(m.linked.slug)}">🍽 ${esc(m.linked.title)} →</a>` : ""}`;
    };

    app.innerHTML = `
      <section class="hero hero-tight"><h1>Gallery</h1><p>Photos from the family's memories.</p></section>
      <div class="gallery" tabindex="0" aria-roledescription="slideshow" aria-label="Memory photos">
        <div class="g-stage">
          ${slides.map((s, k) => `
            <figure class="g-slide kb-${k % 4}" data-k="${k}" aria-hidden="true">
              <img class="g-backdrop" data-src="${esc(s.src)}" alt="" referrerpolicy="no-referrer">
              <img class="g-photo" data-src="${esc(s.src)}" alt="${esc(s.m.title || "Memory photo")}" referrerpolicy="no-referrer">
            </figure>`).join("")}
          <div class="g-progress"><span></span></div>
          <button class="g-nav g-prev" type="button" aria-label="Previous photo">‹</button>
          <button class="g-nav g-next" type="button" aria-label="Next photo">›</button>
          <div class="g-caption" aria-live="polite"></div>
        </div>
        <div class="g-controls">
          <button class="btn btn-ghost btn-small g-play" type="button"></button>
          <span class="g-count"></span>
          <button class="btn btn-ghost btn-small g-full" type="button">⛶ Full screen</button>
        </div>
        <div class="g-thumbs">${slides.map((s, k) =>
          `<button class="g-thumb" type="button" data-k="${k}" aria-label="Photo ${k + 1}"><img data-src="${esc(s.src)}" alt="" referrerpolicy="no-referrer"></button>`).join("")}</div>
      </div>`;

    const root = app.querySelector(".gallery");
    const figs = [...root.querySelectorAll(".g-slide")];
    const thumbs = [...root.querySelectorAll(".g-thumb")];
    const strip = root.querySelector(".g-thumbs");
    const cap = root.querySelector(".g-caption");
    const bar = root.querySelector(".g-progress span");
    const playBtn = root.querySelector(".g-play");
    const load = el => { if (el && el.dataset.src && !el.src) el.src = el.dataset.src; };

    function show(k) {
      i = (k + slides.length) % slides.length;
      [i, i + 1, i - 1].forEach(n => figs[(n + slides.length) % slides.length].querySelectorAll("img").forEach(load));
      figs.forEach((f, n) => {
        const on = n === i;
        f.classList.toggle("active", on);
        f.setAttribute("aria-hidden", String(!on));
      });
      thumbs.forEach((t, n) => t.setAttribute("aria-current", String(n === i)));
      const t = thumbs[i];
      strip.scrollTo({ left: t.offsetLeft - strip.clientWidth / 2 + t.clientWidth / 2, behavior: reduced ? "auto" : "smooth" });
      cap.classList.remove("in");
      void cap.offsetWidth;  // restart the caption's fade-in
      cap.innerHTML = caption(slides[i]);
      cap.classList.add("in");
      root.querySelector(".g-count").textContent = `${i + 1} / ${slides.length}`;
      history.replaceState(null, "", `#/gallery/${i}`);
      restartTimer();
    }

    function restartTimer() {
      clearTimeout(timer);
      bar.style.transition = "none";
      bar.style.width = "0";
      if (!playing || slides.length < 2) return;
      void bar.offsetWidth;
      bar.style.transition = `width ${SLIDE_MS}ms linear`;
      bar.style.width = "100%";
      timer = setTimeout(() => show(i + 1), SLIDE_MS);
    }

    function setPlaying(on) {
      playing = on && slides.length > 1;
      playBtn.textContent = playing ? "❚❚ Pause" : "▶ Play";
      playBtn.hidden = slides.length < 2;
      root.classList.toggle("paused", !playing);
      restartTimer();
    }

    root.querySelector(".g-prev").addEventListener("click", () => show(i - 1));
    root.querySelector(".g-next").addEventListener("click", () => show(i + 1));
    playBtn.addEventListener("click", () => setPlaying(!playing));
    thumbs.forEach(t => t.addEventListener("click", () => show(+t.dataset.k)));
    thumbs.forEach(t => load(t.querySelector("img")));

    const fullBtn = root.querySelector(".g-full");
    if (!root.requestFullscreen) fullBtn.hidden = true;
    fullBtn.addEventListener("click", () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else root.requestFullscreen().catch(() => {});
    });

    // Swipe on phones
    let x0 = null;
    const stage = root.querySelector(".g-stage");
    stage.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener("touchend", e => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 40) show(dx < 0 ? i + 1 : i - 1);
    });

    const onKey = e => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === "ArrowRight") show(i + 1);
      else if (e.key === "ArrowLeft") show(i - 1);
      else if (e.key === " " && e.target.closest(".gallery")) { e.preventDefault(); setPlaying(!playing); }
    };
    // Don't advance while the tab is in the background.
    const onVis = () => { if (document.hidden) clearTimeout(timer); else restartTimer(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVis);
    galleryCleanup = () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVis);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };

    setPlaying(playing);
    show(i);
  }

  // ── Router ──────────────────────────────────────────────────
  function route() {
    const hash = location.hash.replace(/^#\/?/, "");
    const [page, arg] = hash.split("/");
    document.title = CFG.siteTitle || "Family Recipes";
    if (galleryCleanup) { galleryCleanup(); galleryCleanup = null; }
    const section = page === "memories" || page === "add-memory" ? "memories"
      : page === "gallery" ? "gallery"
      : page === "share" || page === "add-recipe" ? "" : "recipes";
    document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("active", a.dataset.nav === section));
    if (page === "recipe") renderRecipe(decodeURIComponent(arg || ""));
    else if (page === "memories") renderMemories();
    else if (page === "share") renderShare();
    else if (page === "gallery") renderGallery(arg);
    else if (page === "add-recipe") renderAddRecipe();
    else if (page === "add-memory") renderAddMemory(decodeURIComponent(arg || ""));
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
