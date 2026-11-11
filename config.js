// ─────────────────────────────────────────────────────────────
//  Site settings — the only file you need to edit.
//  Running google/setup-forms.gs prints most of these values for you.
//  Leave publishedSheetUrl empty to preview the site with sample data.
// ─────────────────────────────────────────────────────────────
window.SITE_CONFIG = {
  siteTitle: "Merchen Family Recipes",
  tagline: "Recipes and memories from around our kitchen table",

  // Google Sheet → File → Share → Publish to web → "Entire document" → Publish.
  // Paste the link it gives you here (any format is fine).
  publishedSheetUrl: "",

  // Tab IDs ("gid") of the two response tabs in that sheet.
  recipesGid: "",
  memoriesGid: "",

  // The public "viewform" links to the two Google Forms.
  recipeFormUrl: "",
  memoryFormUrl: "",

  // Optional: lets "Share a memory about this recipe" pre-fill the recipe name.
  // Looks like "entry.123456789". The setup script prints it.
  memoryFormRecipeEntry: "",
};
