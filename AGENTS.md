# Lienzo v2 — Stage 2

Local proof of concept for Tiendu Theme Engine v2. `config/theme.json` selects engine 2. There is no build step.

Routes live in `routes/`: `page.liquid` serves a page, `[handle]` supplies a parameter, `(tienda)` groups routes without adding a URL segment. Layouts wrap their inner output once with `{{ content }}`. Data comes from adjacent `page.graphql` and `layout.graphql`; view data is under `data`, snippets receive explicit arguments. Only declared query variables reach `request.query`.

`config/routes.json` declares the public URL of products, collections, pages and blog posts. Print `url` fields from data; never build resource paths by hand. Mark the record a page needs with `@required` so a missing one renders the 404 page. Use `{% metadata %}` for the title, description, image and robots, `{% head %}` for extra head tags and `{% redirect %}` for same-store redirects. Prices are cents.

Search is the normal route `/busqueda` (`products(query: $q)`). Collections sort with `?sort=` and paginate with `?page=`. Shared markup lives in `snippets/`, styles in `assets/theme.css` with Lienzo's root tokens.

The SDK, push validation and the full Lienzo rewrite come in later stages. Do not add v1 settings, sections or blocks. Do not publish this repository externally.
