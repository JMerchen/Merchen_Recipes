# Merchen Family Recipes

A simple, clean website for family recipes and memories. Family members add things through
**Google Forms**, and the site shows them automatically, with no accounts, no coding and no rebuilding.

```
Family member ──► Google Form ──► Google Sheet ──(published CSV)──► this website (GitHub Pages)
```

New submissions show up on the site within about **5 minutes** (that's how often Google refreshes the published sheet).

## What's in here

| File | What it does |
|---|---|
| `index.html`, `assets/` | The website itself |
| `config.js` | **The only file you edit.** Form links and sheet link go here |
| `google/setup-forms.gs` | One-time script that creates both Google Forms and the response sheet for you |
| `data/sample-*.csv` | Sample content shown until you connect your forms |

---

## One-time setup (about 15 minutes)

### 1. Create the forms (automatic)

1. Go to <https://script.google.com> and click **New project**.
2. Delete the starter code, paste in everything from [`google/setup-forms.gs`](google/setup-forms.gs), and click 💾 **Save**.
3. In the toolbar, pick `setupMerchenRecipeForms` and click **▶ Run**. Google will ask for permission to
   create forms and sheets in your account. Click through and allow it (you may need *Advanced → Go to project*).
4. Open the **Execution log** at the bottom. It prints a block of settings. Keep this tab open.

You now have, in your Google Drive:
- **Add a Family Recipe** (form)
- **Share a Family Memory** (form)
- **Merchen Family Recipes (responses)** (sheet with a `Recipes` tab and a `Memories` tab)

### 2. (Optional) Allow photo uploads

Google doesn't let scripts add photo-upload questions, so add this by hand to **each** form:

1. Open the form (links are in the log) → **＋ Add question** → change the type to **File upload**.
2. Title it **`Photo (optional)`**. Turn on *Allow only specific file types → Image*, and allow up to 5 files if you like.
3. After the first photo is uploaded, open Google Drive, find the folder named like
   *"Add a Family Recipe (File responses)"*, and **Share → General access → Anyone with the link → Viewer**.
   Do the same for the memories folder. Without this, photos won't show on the site.

> **Heads-up:** Google requires people to be signed in to a Google account to upload files.
> Family members without one can still submit; they just can't attach a photo. They could email
> it to you instead, and you can paste any image link into the Photo cell in the sheet.

### 3. Publish the sheet

1. Open the **Merchen Family Recipes (responses)** sheet.
2. **File → Share → Publish to web** → leave it on **Entire document** → **Publish** → OK.
3. Copy the link it shows.

This makes the responses readable by the website. Anyone with the site can already see everything
on it, so this doesn't expose anything extra, **as long as you don't add an email question** to the forms.

### 4. Fill in `config.js`

Paste the block from the Execution log into [`config.js`](config.js), and put the link from step 3 into
`publishedSheetUrl`. It should end up looking like:

```js
publishedSheetUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-.../pubhtml",
recipesGid: "123456789",
memoriesGid: "987654321",
recipeFormUrl: "https://docs.google.com/forms/d/e/.../viewform",
memoryFormUrl: "https://docs.google.com/forms/d/e/.../viewform",
memoryFormRecipeEntry: "entry.1234567890",
```

### 5. Turn on the website (GitHub Pages)

1. Commit and push to `main`.
2. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `(root)` → Save**.
3. After a minute the site is live at **<https://jmerchen.github.io/Merchen_Recipes/>**. Send that link to the family!

---

## Day-to-day

- **Fix a typo:** edit the cell directly in the Google Sheet. The site updates within ~5 minutes.
- **Hide something** (a duplicate, a test entry): type `yes` in the **Hide** column for that row.
- **Delete something:** delete the row in the sheet.
- **Add a category:** edit the Category dropdown in the recipe form. The site picks up new categories automatically.
- **Recipes typed up from paper copies** live in `data/family-recipes.csv` (same columns as the form's
  sheet) and show up alongside form submissions. Edit that file on GitHub to fix one of them.
- **Link a memory to a recipe:** the memory form's *"Which recipe?"* answer is matched to recipe names
  loosely (e.g. "pot roast" matches "Sunday Pot Roast"). Each recipe page also has a
  *Share a memory about this recipe* button that fills that answer in for you.

### Tips to share with the family

- Put **each ingredient on its own line**. To group them, add a line ending with a colon, like `For the frosting:`.
- Put **each step on its own line**. Numbers are optional; the site numbers them for you.
- Recipes can be printed cleanly with the **🖨 Print recipe** button.

## Previewing locally

Any static file server works, for example:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>. With `publishedSheetUrl` left empty, the site shows the sample data.

## Changing question wording

The site finds each column by key words in the question title, so light rewording is fine. Keep these words in the titles:

- **Recipe form:** `Recipe name`, `Your name`, `Whose recipe`, `Category`, `story`, `Ingredients`, `Instructions`, `Servings`, `How long`, `Notes`/`tips`, `Photo`
- **Memory form:** `Your name`, `short title`, `Your memory`, `recipe`, `Who is`, `When`, `Photo`
