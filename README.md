# Lienzo v2 — Stage 1

Local Tiendu Theme Engine v2 proof of concept, using Lienzo's CSS (MIT).

- `/`: catalog list; `?first=2` changes the declared list size.
- `/productos/<handle>`: a listed product.
- `/categorias/<handle>`: a public collection; `todas` lists all products.
- Unknown paths or handles return the root 404 page.

`routes/layout.liquid` owns the document. `(tienda)/layout.liquid` owns the header/footer. Queries are declared next to each view. Snippets take arguments and assets are ordinary files.

This is a new local Git repository. Push it only to a local store through `http://127.0.0.1:4500/<store-handle>.git`, with a local store API key via a credential helper. `live` updates that local store immediately. Other branches create previews. No external remote or publication is configured.

The complete SDK, URL mapping, documentation and full Lienzo rewrite belong to later stages. See the platform's `specs/theme-engine-v2-stage-1-report.md` for the verified local URLs and commands.
