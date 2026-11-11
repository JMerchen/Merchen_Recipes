/**
 * Merchen Family Recipes — comments & photos backend.
 *
 * Lets anyone leave a comment and/or add photos on a recipe page, with no Google sign-in.
 * Comments go into a "Comments" tab of the responses spreadsheet; photos go into a Drive folder
 * shared as "anyone with the link can view" so the site can show them.
 *
 * Setup (see README → "Comments & photos"):
 *   1. Open the "Merchen Family Recipes (responses)" sheet → Extensions → Apps Script.
 *   2. Add a new script file, paste this whole file in, and save.
 *   3. Pick `setupComments` in the toolbar and click ▶ Run (approve the permissions).
 *   4. Deploy → New deployment → type "Web app" → Execute as: Me, Who has access: Anyone → Deploy.
 *   5. Copy the Web app URL (ends in /exec) into commentsApiUrl in config.js.
 *
 * To hide a comment, type "yes" in its Hide column. It disappears from the site right away.
 */

const COMMENTS_SHEET = 'Comments';
const PHOTO_FOLDER_NAME = 'Merchen Family Recipes – Comment Photos';
const HEADERS = ['Timestamp', 'Recipe ID', 'Recipe', 'Name', 'Comment', 'Photos', 'Hide'];
const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_TEXT = 4000;

function setupComments() {
  const sheet = commentsSheet_();
  const folder = photoFolder_();
  Logger.log('Comments tab ready: ' + sheet.getName());
  Logger.log('Photo folder: ' + folder.getUrl());
  Logger.log('Now deploy this as a Web app (Deploy → New deployment).');
}

/** GET → all visible comments as JSON: { comments: [{ ts, recipeId, recipe, name, text, photos[] }] } */
function doGet() {
  const rows = commentsSheet_().getDataRange().getValues().slice(1);
  const comments = rows
    .filter(r => r[1] && !/^(y|yes|x|true|hide|hidden)$/i.test(String(r[6]).trim()))
    .map(r => ({
      ts: r[0] instanceof Date ? r[0].getTime() : Date.parse(r[0]) || 0,
      recipeId: String(r[1]),
      recipe: String(r[2]),
      name: String(r[3]),
      text: String(r[4]),
      photos: String(r[5] || '').split(/\s+/).filter(Boolean),
    }));
  return json_({ comments: comments });
}

/** POST (sent as text/plain JSON) → { ok: true, comment } or { ok: false, error } */
function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.website) return json_({ ok: true }); // honeypot field that only bots fill in

    const recipeId = clean_(body.recipeId, 200);
    const recipe = clean_(body.recipe, 200);
    const name = clean_(body.name, 100);
    const text = clean_(body.text, MAX_TEXT);
    const photos = Array.isArray(body.photos) ? body.photos.slice(0, MAX_PHOTOS) : [];
    if (!recipeId) throw new Error('Missing recipe.');
    if (!name) throw new Error('Please add your name.');
    if (!text && !photos.length) throw new Error('Add a comment or a photo.');

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const folder = photoFolder_();
      const urls = photos.map((p, i) => {
        const bytes = Utilities.base64Decode(String(p.data || ''));
        if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) throw new Error('A photo was empty or too large.');
        const type = /^image\/(jpeg|png|gif|webp)$/.test(p.type) ? p.type : 'image/jpeg';
        const blob = Utilities.newBlob(bytes, type, `${recipeId}-${Date.now()}-${i + 1}.${type.split('/')[1]}`);
        const file = folder.createFile(blob);
        file.setDescription(`${recipe} — added by ${name}`);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        return 'https://drive.google.com/file/d/' + file.getId() + '/view';
      });
      const now = new Date();
      commentsSheet_().appendRow([now, recipeId, recipe, name, text, urls.join(' '), '']);
      return json_({ ok: true, comment: { ts: now.getTime(), recipeId, recipe, name, text, photos: urls } });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

// ── helpers ─────────────────────────────────────────────────────
function commentsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(COMMENTS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(COMMENTS_SHEET);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sheet;
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

function clean_(v, max) {
  return String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim().slice(0, max);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
