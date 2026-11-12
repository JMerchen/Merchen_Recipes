/**
 * Merchen Family Recipes — site backend (version 3).
 *
 * Lets anyone, with no Google sign-in:
 *   • leave a comment and/or add photos on a recipe
 *   • add a new recipe or memory straight from the site
 *   • add or change a recipe's cover photo
 *   • change a recipe's tags
 *
 * Every submission must include the contributor number the site asks for (ACCESS_CODE below).
 *
 * Everything is saved in tabs of the responses spreadsheet ("Comments", "Site Recipes",
 * "Site Memories", "Covers"); photos go into a Drive folder shared as "anyone with the link can view".
 * To hide anything, type "yes" in its Hide column. It disappears from the site right away.
 *
 * Setup (see README → "Comments, photos & adding from the site"):
 *   1. Open the "Merchen Family Recipes (responses)" sheet → Extensions → Apps Script.
 *   2. Paste this whole file into the script file (replacing what's there) and save.
 *   3. Pick `setup` in the toolbar and click ▶ Run (approve the permissions).
 *   4. First time: Deploy → New deployment → "Web app" → Execute as: Me, Who has access: Anyone.
 *      Updating: Deploy → Manage deployments → ✏️ → Version: "New version" → Deploy (URL stays the same).
 *   5. The Web app URL (ends in /exec) goes in commentsApiUrl in config.js.
 */

const VERSION = 3;
// The number the site asks contributors for. Keep it the same as contributorCode in config.js.
// Set to '' to turn the check off.
const ACCESS_CODE = '13';
const PHOTO_FOLDER_NAME = 'Merchen Family Recipes – Comment Photos';
const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_TEXT = 10000;

// Each tab: its columns, and how a row becomes JSON for the site.
const TABS = {
  comments: {
    name: 'Comments',
    headers: ['Timestamp', 'Recipe ID', 'Recipe', 'Name', 'Comment', 'Photos', 'Hide'],
    key: 'Recipe ID',
    toJSON: r => ({ recipeId: r['Recipe ID'], recipe: r['Recipe'], name: r['Name'], text: r['Comment'] }),
  },
  recipes: {
    name: 'Site Recipes',
    headers: ['Timestamp', 'Recipe name', 'Your name', 'Whose recipe', 'Category', 'Story',
      'Ingredients', 'Instructions', 'Servings', 'Time', 'Notes', 'Photos', 'Hide'],
    key: 'Recipe name',
    toJSON: r => ({
      title: r['Recipe name'], by: r['Your name'], origin: r['Whose recipe'], category: r['Category'],
      story: r['Story'], ingredients: r['Ingredients'], instructions: r['Instructions'],
      servings: r['Servings'], time: r['Time'], notes: r['Notes'],
    }),
  },
  memories: {
    name: 'Site Memories',
    headers: ['Timestamp', 'Short title', 'Your name', 'Which recipe', 'Who is in it', 'Memory', 'When', 'Photos', 'Hide'],
    key: 'Memory',
    toJSON: r => ({
      title: r['Short title'], by: r['Your name'], recipe: r['Which recipe'],
      people: r['Who is in it'], text: r['Memory'], when: r['When'],
    }),
  },
  tags: {
    name: 'Tags',
    headers: ['Timestamp', 'Recipe ID', 'Recipe', 'Name', 'Tags', 'Hide'],
    key: 'Recipe ID',
    toJSON: r => ({ recipeId: r['Recipe ID'], recipe: r['Recipe'], name: r['Name'], tags: r['Tags'] }),
  },
  covers: {
    name: 'Covers',
    headers: ['Timestamp', 'Recipe ID', 'Recipe', 'Name', 'Photos', 'Hide'],
    key: 'Recipe ID',
    toJSON: r => ({ recipeId: r['Recipe ID'], recipe: r['Recipe'], name: r['Name'] }),
  },
};

function setup() {
  Object.keys(TABS).forEach(k => Logger.log('Tab ready: ' + sheet_(k).getName()));
  Logger.log('Photo folder: ' + photoFolder_().getUrl());
  Logger.log('Now deploy (or redeploy a new version of) this Web app.');
}
// Kept so the old toolbar entry still works.
function setupComments() { setup(); }

/** GET → everything the site needs, as JSON. */
function doGet() {
  const out = { version: VERSION };
  Object.keys(TABS).forEach(k => { out[k] = readTab_(k); });
  return json_(out);
}

/** POST (sent as text/plain JSON). body.action: "comment" (default), "recipe", "memory", "cover" or "tags". */
function doPost(e) {
  try {
    const b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (b.website) return json_({ ok: true }); // honeypot field that only bots fill in
    if (ACCESS_CODE && String(b.code || '').trim() !== ACCESS_CODE) throw new Error('Please enter the family number first.');
    const action = b.action || 'comment';
    const name = clean_(b.name, 100);
    if (!name) throw new Error('Please add your name.');

    const lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try {
      if (action === 'comment') {
        const recipeId = req_(b.recipeId, 'recipe', 200), recipe = clean_(b.recipe, 200), text = clean_(b.text, MAX_TEXT);
        if (!text && !(b.photos || []).length) throw new Error('Add a comment or a photo.');
        const photos = savePhotos_(b.photos, recipeId, `${recipe}: added by ${name}`);
        return saved_('comments', { 'Recipe ID': recipeId, 'Recipe': recipe, 'Name': name, 'Comment': text, 'Photos': photos });
      }
      if (action === 'recipe') {
        const title = req_(b.title, 'recipe name', 200);
        const row = {
          'Recipe name': title, 'Your name': name, 'Whose recipe': clean_(b.origin, 200),
          'Category': clean_(b.category, 300) || 'Other', 'Story': clean_(b.story, MAX_TEXT),
          'Ingredients': req_(b.ingredients, 'ingredients', MAX_TEXT), 'Instructions': req_(b.instructions, 'instructions', MAX_TEXT),
          'Servings': clean_(b.servings, 100), 'Time': clean_(b.time, 100), 'Notes': clean_(b.notes, MAX_TEXT),
        };
        row['Photos'] = savePhotos_(b.photos, title, `${title}: added by ${name}`);
        return saved_('recipes', row);
      }
      if (action === 'memory') {
        const text = req_(b.text, 'memory', MAX_TEXT);
        const row = {
          'Short title': clean_(b.title, 200), 'Your name': name, 'Which recipe': clean_(b.recipe, 200),
          'Who is in it': clean_(b.people, 300), 'Memory': text, 'When': clean_(b.when, 100),
        };
        row['Photos'] = savePhotos_(b.photos, 'memory', `Memory from ${name}`);
        return saved_('memories', row);
      }
      if (action === 'tags') {
        const recipeId = req_(b.recipeId, 'recipe', 200);
        const tags = clean_(b.tags, 300) || 'Other';
        return saved_('tags', { 'Recipe ID': recipeId, 'Recipe': clean_(b.recipe, 200), 'Name': name, 'Tags': tags });
      }
      if (action === 'cover') {
        const recipeId = req_(b.recipeId, 'recipe', 200), recipe = clean_(b.recipe, 200);
        let photo = clean_(b.existingPhoto, 500);
        if (photo && !/^https:\/\/(drive|docs)\.google\.com\//.test(photo)) throw new Error('That photo link isn\'t supported.');
        if (!photo) photo = savePhotos_((b.photos || []).slice(0, 1), `${recipeId}-cover`, `${recipe} cover: added by ${name}`);
        if (!photo) throw new Error('Choose a photo.');
        return saved_('covers', { 'Recipe ID': recipeId, 'Recipe': recipe, 'Name': name, 'Photos': photo });
      }
      throw new Error('Unknown action.');
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

// ── helpers ─────────────────────────────────────────────────────
function sheet_(key) {
  const t = TABS[key];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(t.name);
  if (!sheet) {
    sheet = ss.insertSheet(t.name);
    sheet.appendRow(t.headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, t.headers.length).setFontWeight('bold');
  }
  return sheet;
}

function readTab_(key) {
  const t = TABS[key];
  const values = sheet_(key).getDataRange().getValues();
  const head = values[0].map(String);
  return values.slice(1)
    .map(v => { const r = {}; head.forEach((h, i) => { r[h] = v[i]; }); return r; })
    .filter(r => String(r[t.key] || '').trim() && !/^(y|yes|x|true|hide|hidden)$/i.test(String(r['Hide'] || '').trim()))
    .map(r => rowJSON_(t, r));
}

function rowJSON_(t, r) {
  const o = t.toJSON(r);
  Object.keys(o).forEach(k => { o[k] = o[k] == null ? '' : String(o[k]); });
  const ts = r['Timestamp'];
  o.ts = ts instanceof Date ? ts.getTime() : Date.parse(ts) || 0;
  o.photos = String(r['Photos'] || '').split(/\s+/).filter(Boolean);
  return o;
}

function saved_(key, row) {
  const t = TABS[key];
  row['Timestamp'] = new Date();
  row['Hide'] = '';
  const sheet = sheet_(key);
  const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  sheet.appendRow(head.map(h => (h in row ? row[h] : '')));
  return json_({ ok: true, item: rowJSON_(t, row) });
}

function savePhotos_(photos, prefix, description) {
  photos = Array.isArray(photos) ? photos.slice(0, MAX_PHOTOS) : [];
  if (!photos.length) return '';
  const folder = photoFolder_();
  const safe = String(prefix).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
  return photos.map((p, i) => {
    const bytes = Utilities.base64Decode(String(p.data || ''));
    if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) throw new Error('A photo was empty or too large.');
    const type = /^image\/(jpeg|png|gif|webp)$/.test(p.type) ? p.type : 'image/jpeg';
    const file = folder.createFile(Utilities.newBlob(bytes, type, `${safe}-${Date.now()}-${i + 1}.${type.split('/')[1]}`));
    file.setDescription(description);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return 'https://drive.google.com/file/d/' + file.getId() + '/view';
  }).join(' ');
}

function photoFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PHOTO_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* deleted; make a new one */ }
  }
  const folder = DriveApp.createFolder(PHOTO_FOLDER_NAME);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  props.setProperty('PHOTO_FOLDER_ID', folder.getId());
  return folder;
}

function req_(v, label, max) {
  const s = clean_(v, max);
  if (!s) throw new Error('Please fill in the ' + label + '.');
  return s;
}

function clean_(v, max) {
  return String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim().slice(0, max);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
