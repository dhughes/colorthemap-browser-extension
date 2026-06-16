# Vendored CTM design system

These files are copied **verbatim** from Color The Map's frontend so the
extension's UI matches the web app:

| File | Source (in the `color-the-map` repo) |
| --- | --- |
| `design-system.css` | `frontend/src/styles/design-system.css` |
| `tokens.css` | `frontend/src/styles/tokens.css` |
| `fonts.css` | `frontend/src/styles/fonts.css` |
| `components.css` | `frontend/src/styles/components.css` |
| `../../public/fonts/general-sans/*.woff2` | `frontend/public/fonts/general-sans/*.woff2` |

`design-system.css` is the entry point (it `@import`s the other three); pages
load that single file.

**Do not hand-edit these.** They are a mirror — when CTM's design system
changes, re-copy from the source above so the two stay in lockstep. The brand
primary is magenta (`--color-primary`); green (`--color-success`) is a status
color only.
