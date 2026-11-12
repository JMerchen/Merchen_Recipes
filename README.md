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

## Comments, photos & adding from the site

Once the site backend is set up, anyone can do all of this right on the site, with no Google sign-in:

- **Add a recipe or memory** (the *Add a recipe* / *Share a memory* buttons open forms on the site itself).
- **Comment and add photos** on any recipe (up to 6 photos at a time).
- **Add or change a recipe's cover photo**: open the recipe and click *Add a cover photo* or
  *Change cover photo*. You can upload a new picture or pick one already on that recipe.

It's powered by a Google Apps Script ([`google/comments-backend.gs`](google/comments-backend.gs)) that saves
everything in tabs of your responses sheet (`Comments`, `Site Recipes`, `Site Memories`, `Covers`) and
photos in a shared Drive folder. Recipes and memories sent through the Google Forms still show up too.

**First-time setup**

1. Open the **Merchen Family Recipes (responses)** sheet → **Extensions → Apps Script**.
2. Click **＋ → Script**, name it `comments`, paste in all of `google/comments-backend.gs`, and save.
3. In the toolbar pick `setup` and click **▶ Run**. Approve the permissions (Google will warn
   that the app isn't verified; click *Advanced → Go to … (unsafe)*, which is normal for your own script).
4. **Deploy → New deployment** → gear icon → **Web app**. *Execute as* **Me**, *Who has access* **Anyone** → **Deploy**.
5. Copy the **Web app URL** (ends in `/exec`) into `commentsApiUrl` in `config.js`.

**Updating the script later:** paste the new code over the old, save, run `setup` once, then
**Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The URL stays the same.

**Hiding something:** type `yes` in its **Hide** column (in whichever tab it's in). It disappears right away.
For a cover photo, hiding the row puts the previous cover back.

## Tags and the contributor question

**Tags:** a recipe can have several tags (say *Breads*, *Breakfast* and *Holidays*), and it shows up under
each one on the home page. Anyone can change a recipe's tags with **✎ Edit tags** at the top of the recipe.
In the sheet and in `data/family-recipes.csv`, tags are stored in the Category column, separated by commas.
To let the Google Form pick several too, change its Category question from *Dropdown* to *Checkboxes*.

**Contributor question:** the first time someone adds or changes anything in a browser session, the site
asks "What's the family number?" The question and answer are `contributorQuestion` and `contributorCode`
in `config.js`; the Apps Script checks the same answer (`ACCESS_CODE` in `google/comments-backend.gs`),
so keep the two the same. It keeps out strangers and bots, but the answer is visible in the site's public
code, so it isn't a password.

## Gallery search

The Gallery has a search box. It matches in two ways:

- **Words and themes (instant):** exact words in a memory's title, date, story, people or recipe, plus
  built-in themes, so *holidays* finds Christmas, Easter, Halloween, Thanksgiving, Fourth of July and so on,
  and *summer* finds June, July and August. Edit the `THEMES` list in `assets/search.js` to add more.
- **Meaning (loads on first search):** a small AI model (all-MiniLM-L6-v2) that runs entirely in the
  visitor's browser, with no API key or server. It finds memories that are *about* the search even when the
  words differ (*cold weather* finds "Snowed in"). The first search on each device downloads about 25 MB
  from Hugging Face and jsDelivr; after that the browser keeps it. If it can't load, search still works on
  words and themes.

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
