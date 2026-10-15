# Lienzo v2 — Stage 1

This is a local proof of concept for Tiendu Theme Engine v2. `config/theme.json` selects engine 2. There is no build step.

Routes live in `routes/`: `page.liquid` serves a page, `[handle]` supplies a parameter, `(tienda)` groups routes without adding a URL segment. Layouts wrap their inner output once with `{{ content }}`. Data comes from adjacent `page.graphql` and `layout.graphql`; view data is under `data`, snippets receive explicit arguments. Only declared query variables reach `request.query`.

Use `{% metadata title: value, description: value %}` for metadata and `{% not_found %}` for missing records. Shared markup lives in `snippets/`, styles in `assets/theme.css` with Lienzo's root tokens. Prices are cents. Store photos remain in the gallery.

Stage 1 has no SDK, route mapping, pagination, search, or push validation. The temporary theme uses literal Spanish resource links. Later stages will add `config/routes.json` and the SDK. Do not add v1 settings, sections or blocks. Do not publish this repository externally.
