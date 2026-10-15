# Slate

Tiendu's default storefront theme on Theme Engine 2, with an editorial design. Spanish storefront routes cover home, products, collections (`/categorias`, including `/categorias/todas`), pages, blog, search and 404. Cart, checkout, account and wishlist use Tiendu's SDK and platform overlays.

- `routes/`: Liquid pages, layouts and GraphQL data. `(tienda)` owns shared chrome.
- `snippets/`: reusable markup, home features and resource templates.
- `queries/`: named data queries, including the 404's shared navigation.
- `assets/`: CSS tokens, browser behavior and released SDK.
- `config/theme.json`: engine/name; `config/routes.json`: public resource patterns.
- `DESIGN.md`: visual design; `AGENTS.md`: coding and resource conventions.

There is no build or package install. Storefront copy is edited in Liquid and design tokens in assets/theme.css. The header and footer read the menus `principal` and `footer`; new Tiendu stores get both.

Clone your store repository with a store API key using a credential helper (never commit credentials):

```bash
git clone https://git.tiendu.uy/STORE_HANDLE.git
cd STORE_HANDLE
git switch -c design-update
# Edit theme files, then:
git add .
git commit -m "Update storefront"
git push -u origin design-update
```

The Git server prints the branch's preview URL. Open it to check the pages and interactions; preview code is isolated, but catalog data and checkout are real. Fix reported validation errors and warnings before publishing.

To publish an approved branch, fetch first, merge the reviewed changes into `live`, then push:

```bash
git fetch origin
git switch live
git merge --ff-only origin/live
git merge design-update
git push origin live
```

Delete a finished preview with `git push origin --delete design-update`. Never force-push live.

Platform documentation and SDK releases: https://docs.tiendu.uy. Keep assets/tiendu-sdk.js byte-identical to its released version (currently 1.0.0).
