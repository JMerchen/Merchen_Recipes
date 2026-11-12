// ─────────────────────────────────────────────────────────────
//  Site settings — the only file you need to edit.
//  Running google/setup-forms.gs prints most of these values for you.
//  Leave publishedSheetUrl empty to preview the site with sample data.
// ─────────────────────────────────────────────────────────────
window.SITE_CONFIG = {
  siteTitle: "Merchen Family Recipes",
  tagline: "Recipes and memories from around our kitchen table",

  // Family photo shown at the top of the home page (in place of the title) and first in the gallery.
  // Leave empty to show the title and tagline instead.
  familyPhoto: "assets/family.jpg",
  familyPhotoCaption: "The Merchen family",

  // Google Sheet → File → Share → Publish to web → "Entire document" → Publish.
  // Paste the link it gives you here (any format is fine).
  publishedSheetUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSXL_Nmyp0UtkSCHlKvU9_d7gIhoxpFdPgpDvJ_ymUhinnHCsZ6oqjtC1NB9TCjTli7vBVlJNDWVqrJ/pubhtml",

  // Tab IDs ("gid") of the two response tabs in that sheet.
  recipesGid: "1703154401",
  memoriesGid: "1319681349",

  // The public "viewform" links to the two Google Forms.
  recipeFormUrl: "https://docs.google.com/forms/d/e/1FAIpQLSdFwMAxd37q-STKBctyB64yrzRbEocVyHQIYQnk822calMQ9w/viewform",
  memoryFormUrl: "https://docs.google.com/forms/d/e/1FAIpQLSfx2wxDDlGofZbHb2urZaHBcqE71cddd5uPH45yC-dNLWmrwQ/viewform",

  // Optional: lets "Share a memory about this recipe" pre-fill the recipe name.
  // Looks like "entry.123456789". The setup script prints it.
  memoryFormRecipeEntry: "entry.1612679184",

  // Web app URL (ends in /exec) from deploying google/comments-backend.gs.
  // Turns on "Comments & photos" under every recipe. Leave empty to hide it.
  commentsApiUrl: "https://script.google.com/macros/s/AKfycbyMsbhuECCbHVohl1bU8m03J7uoGri1MMZhCWaAT9T88dzCCGrpRC2-FubTiXwbOenn/exec",

  // Anyone adding or changing something answers this once per browser session.
  // Keep contributorCode the same as ACCESS_CODE in google/comments-backend.gs. Leave empty to turn it off.
  contributorQuestion: "What's the family number?",
  contributorCode: "13",
};
