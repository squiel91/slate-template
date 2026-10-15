# Lienzo v2 — Stage 2

Local Tiendu Theme Engine v2 proof of concept, using Lienzo's CSS (MIT).

- `/`: best sellers; `?first=2` changes the declared list size.
- `/productos/<handle>`: a listed product with images, options and related products.
- `/categorias/<handle>`: a public collection with sort (`?sort=price-asc`) and pages (`?page=2`); `todas` lists all products.
- `/busqueda?q=<texto>`: product search.
- `/paginas/<handle>`: a CMS page.
- `/blog` and `/blog/<handle>`: blog posts.
- Unknown paths or handles return the root 404 page.

`routes/layout.liquid` owns the document. `(tienda)/layout.liquid` owns the header/footer. Queries are declared next to each view. `config/routes.json` maps resources to URLs. Snippets take arguments and assets are ordinary files.

This is a local Git repository. Push it only to a local store through `http://127.0.0.1:4500/<store-handle>.git`, with a local store API key via a credential helper. `live` updates that local store immediately. Other branches create previews. No external remote or publication is configured.

See the platform's `specs/theme-engine-v2-stage-2-report.md` for the verified local URLs and commands.
