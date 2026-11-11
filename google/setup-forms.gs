/**
 * One-time setup: creates the "Add a Family Recipe" and "Share a Family Memory" Google Forms,
 * links both to one Google Sheet, and logs the values to paste into config.js.
 *
 * How to run:
 *   1. Go to https://script.google.com and click "New project".
 *   2. Delete the starter code, paste this whole file in, and click Save.
 *   3. Choose "setupMerchenRecipeForms" in the toolbar and click Run. Approve the permissions it asks for.
 *   4. Open "Execution log" and copy the config block it prints.
 *
 * The site matches sheet columns by their question text, so you can reword questions a little,
 * but keep the key words (e.g. "Recipe name", "Ingredients", "Your memory").
 */
function setupMerchenRecipeForms() {
  var ss = SpreadsheetApp.create('Merchen Family Recipes (responses)');

  // ── Recipe form ──
  var recipe = FormApp.create('Add a Family Recipe');
  recipe.setDescription(
    'Share a family recipe! It will show up on the family recipe site within about 5 minutes.\n' +
    'Tip: put each ingredient and each step on its own line.');
  recipe.setConfirmationMessage('Thank you! Your recipe will appear on the family site in a few minutes.');
  recipe.setCollectEmail(false);
  recipe.addTextItem().setTitle('Recipe name').setRequired(true);
  recipe.addTextItem().setTitle('Your name').setRequired(true);
  recipe.addTextItem().setTitle('Whose recipe is it originally?')
    .setHelpText('e.g. Grandma Ruth, Uncle Joe, or "mine!"');
  recipe.addListItem().setTitle('Category').setRequired(true).setChoiceValues([
    'Breakfast', 'Appetizers & Snacks', 'Soups & Salads', 'Mains', 'Sides',
    'Breads', 'Desserts', 'Drinks', 'Holidays', 'Other']);
  recipe.addParagraphTextItem().setTitle('The story behind it')
    .setHelpText('Where did it come from? When do you make it? Any memories attached?');
  recipe.addParagraphTextItem().setTitle('Ingredients (one per line)').setRequired(true)
    .setHelpText('One ingredient per line. For sections, end a line with a colon, like "For the frosting:"');
  recipe.addParagraphTextItem().setTitle('Instructions (one step per line)').setRequired(true)
    .setHelpText('One step per line. Numbers are optional; the site numbers them for you.');
  recipe.addTextItem().setTitle('Servings').setHelpText('e.g. 6, or "a 9x13 pan"');
  recipe.addTextItem().setTitle('How long does it take?').setHelpText('e.g. 45 minutes, or 3 hours');
  recipe.addParagraphTextItem().setTitle('Notes & tips');

  // ── Memory form ──
  var memory = FormApp.create('Share a Family Memory');
  memory.setDescription('Share a story, a moment, or a photo. It doesn\'t have to be about food!');
  memory.setConfirmationMessage('Thank you for sharing! It will appear on the family site in a few minutes.');
  memory.setCollectEmail(false);
  memory.addTextItem().setTitle('Your name').setRequired(true);
  memory.addTextItem().setTitle('Give your memory a short title').setHelpText('e.g. "Thanksgiving 1992"');
  memory.addParagraphTextItem().setTitle('Your memory').setRequired(true);
  var recipeQ = memory.addTextItem().setTitle('Is this about a family recipe? Which one?')
    .setHelpText('Optional. Type the recipe name and the memory will show on that recipe\'s page.');
  memory.addTextItem().setTitle('Who is in this memory?');
  memory.addTextItem().setTitle('When was this?').setHelpText('A year, a decade, or "every Christmas"');

  // ── Link both forms to the sheet and name the tabs ──
  var recipeGid = linkForm_(ss, recipe, 'Recipes');
  var memoryGid = linkForm_(ss, memory, 'Memories');
  var blank = ss.getSheetByName('Sheet1');
  if (blank && ss.getSheets().length > 1) ss.deleteSheet(blank);

  var prefill = memory.createResponse()
    .withItemResponse(recipeQ.createResponse('__RECIPE__')).toPrefilledUrl();
  var entry = (prefill.match(/(entry\.\d+)=__RECIPE__/) || [])[1] || '';

  Logger.log([
    '',
    '✅ Done! Next steps:',
    '1. Add an optional "Photo (optional)" File upload question to each form (see README).',
    '2. Open the sheet → File → Share → Publish to web → Entire document → Publish, and copy the link.',
    '',
    'Response sheet:  ' + ss.getUrl(),
    'Edit recipe form: ' + recipe.getEditUrl(),
    'Edit memory form: ' + memory.getEditUrl(),
    '',
    '──── paste into config.js ────',
    '  publishedSheetUrl: "PASTE THE PUBLISH-TO-WEB LINK HERE",',
    '  recipesGid: "' + recipeGid + '",',
    '  memoriesGid: "' + memoryGid + '",',
    '  recipeFormUrl: "' + recipe.getPublishedUrl() + '",',
    '  memoryFormUrl: "' + memory.getPublishedUrl() + '",',
    '  memoryFormRecipeEntry: "' + entry + '",',
    '──────────────────────────────',
  ].join('\n'));
}

/** Points a form at the spreadsheet, renames the new responses tab, adds a "Hide" column, returns its gid. */
function linkForm_(ss, form, tabName) {
  var before = ss.getSheets().map(function (s) { return s.getSheetId(); });
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  SpreadsheetApp.flush();
  var sheet = null;
  for (var tries = 0; tries < 10 && !sheet; tries++) {
    var fresh = SpreadsheetApp.openById(ss.getId());
    sheet = fresh.getSheets().filter(function (s) { return before.indexOf(s.getSheetId()) === -1; })[0] || null;
    if (!sheet) Utilities.sleep(1000);
  }
  if (!sheet) throw new Error('Could not find the responses tab for ' + form.getTitle());
  sheet.setName(tabName);
  sheet.setFrozenRows(1);
  var hideCol = sheet.getLastColumn() + 1;
  sheet.getRange(1, hideCol).setValue('Hide')
    .setNote('Type "yes" in this column to hide a row from the website.');
  return String(sheet.getSheetId());
}
