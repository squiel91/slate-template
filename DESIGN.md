# Slate design system

Read this file before adding or restyling a page or snippet. Tokens live in `assets/theme.css` (`:root`). Prefer those variables over new hex values.

The storefront is an editorial ceramics shop: cream paper, serif display type, quiet sans body, and images that sit on the page without card chrome. New work should feel like a magazine for objects, not a SaaS landing page.

## Voice

- Copy is Spanish (`vos` where it fits: *revisá*, *dejanos*).
- Short, concrete sentences. No marketing superlatives, numbered USPs, or filler (“descubre”, “experiencia única”).
- Section kickers are one or two words. Titles name the thing, not a campaign.

## Color

| Token | Hex | Use |
| --- | --- | --- |
| `--color-bg` | `#f6f3ee` | Page ground |
| `--color-bg-elevated` | `#fffdf9` | Inputs, raised surfaces |
| `--color-ink` | `#1c1917` | Text, logos, primary buttons |
| `--color-muted` | `#6f6a64` | Kickers, excerpts, helpers |
| `--color-line` | `#e4dfd7` | Hairlines, field borders |
| `--color-accent` | `#1c1917` | Primary actions (same as ink) |
| `--color-accent-text` | `#f6f3ee` | Text on accent |
| `--color-danger` | `#9f3a2f` | Errors |
| `--color-success` | `#2f7d4a` | Verified purchase |
| `--color-hero` | `#2a2521` | Hero overlay ground |
| `--color-hero-text` | `#f7f4ef` | Text on hero media |
| `--color-star-empty` | mix of ink on bg | Empty rating stars |
| `--overlay-dim` | 42% ink | Drawer and dialog backdrops |
| `--overlay-scrim` | hero gradient | Photo overlays on banners and slides |

Tints of ink on the page ground are allowed (`color-mix(in srgb, var(--color-ink) 4%, var(--color-bg))` for contrast bands). Do not introduce a brand accent color unless asked. Do not use shadows as the main separator. Do not add new hex values in component CSS — extend `:root` instead.

## Typography

- Body: Inter (`--font-body`), 16px, line-height `1.55`, tracking `-0.011em`.
- Display / titles: Newsreader (`--font-heading`), weight 400, tracking `-0.02em`, line-height `1.2`.
- Italic Newsreader is for quotes, shop-note titles, and occasional display emphasis — not for every heading.
- Kickers: Inter, `--text-xs` (12px), weight 500, uppercase, tracking `0.14em`, muted.
- Scale: `h1` clamp `2.35–4.25rem`; `h2` / `.section-title` `1.7–2.35rem`; `h3` `1.35rem`; body `1rem`; small `0.875rem`; kicker `0.75rem`.
- Long reading (pages, articles): `--prose-width` (`40rem`). Do not stretch prose to the full page width.

## Spacing

Use the scale instead of ad-hoc rem values when possible:

| Token | Size |
| --- | --- |
| `--space-1` | `0.25rem` |
| `--space-2` | `0.5rem` |
| `--space-3` | `0.75rem` |
| `--space-4` | `1rem` |
| `--space-5` | `1.5rem` |
| `--space-6` | `2.25rem` |
| `--space-7` | `3.5rem` |
| `--space-8` | `5.5rem` |

- Default section padding: `--space-7` (`3.5rem`). Compact sections: `--space-6`. Use `.section` on homepage and mid-page features, not on the first visual block of a route.
- Route shells (PDP, listings, blog, article, page, 404): `.page.page-width`. Padding `--space-5` top / `--space-8` bottom so breadcrumbs share one line.
- Content max width: `--page-width` (`74rem`). Horizontal gutter: `2rem`, `3.5rem` from `720px`.
- Section headers sit `--space-5` above the body, with kicker + title on the left and a text link on the right when there is a “ver todos” action.
- Prefer one hairline (`1px solid var(--color-line)`) over stacked rules. Do not box a section with a full rectangle of borders.

## Radius and chrome

- `--radius` is `0.25rem` — almost square. Use it on buttons, fields, and icon buttons.
- `--radius-pill` (`999px`) is only for badges, the wishlist heart, gallery nav, and the WhatsApp chip.
- Images, media frames, and product/collection tiles have **no radius** and **no drop shadow**.
- Quiet text actions (`.button-quiet`) have `border-radius: 0` and an underline rule.
- No card containers, no icon-in-circle treatments, no numbered `01 02 03` feature rows.

## Layout and breakpoints

| Width | Role |
| --- | --- |
| `< 768px` | Phone. Account and favorites live in the side menu. Collections are 1 column. |
| `768–879px` | Tablet. Hamburger nav, but header still shows account and favorites. |
| `≥ 880px` | Desktop nav in the header. |
| `≥ 800px` | Two-column collection/article grids; three shop-note columns; split features. |
| `≥ 1000px` | Three-column article grids; four-column product grids (2 columns below `800px`). |

Asymmetry is welcome: staggered testimonials, a featured blog post that is half image / half copy, a split feature with type on one side. Equal three-up icon grids are not.

## Imagery

- Frames: `.media` on a 6% ink wash, `object-fit: cover`.
- Product `4 / 5`, collection `3 / 4`, article `16 / 10`, featured home post `5 / 4` on desktop.
- Hover zoom (`1.035`) only on linked media, and only when `(hover: hover)`.
- Use store gallery URLs from MCP. Do not invent product photography.

## Components

- **Primary button:** ink fill, cream type, min-height `2.75rem`. Hover lowers opacity, no color shift.
- **Ghost button:** transparent, `1px` line border.
- **Light button:** cream fill on dark hero slides.
- **Text link:** small sans, optional 16px stroke icon (`stroke_width` ~1.6–1.7).
- **Fields:** elevated fill, line border, same radius and min-height as buttons. Focus uses an ink outline offset.
- **Icons:** Lucide partials in `lib/icons/*.liquid`. Stroke, not fill, unless the symbol is a rating star.

## Motion

- Opt in with `data-animate-in` on the section that should rise. Do not put it on the navbar, hero/carousel/banner, product gallery, page body, blog/article content, or footer.
- Distance is about `5.75rem`, duration ~`1.15s`, `cubic-bezier(0.16, 1, 0.3, 1)`. The observer waits until the block is well into the viewport (`rootMargin` bottom `-38%`).
- Honor `prefers-reduced-motion`: skip reveal, skip image zoom, skip carousel autoplay.

## Do not

- Recreate a generic “trust badges” row (icons + short titles + 01/02/03).
- Wrap listings in white cards, shadows, or heavy radius.
- Add a second accent color, gradients, or stock-illustration decorations.
- Hardcode English UI strings on storefront chrome.
- Animate the first visual block of a route.
