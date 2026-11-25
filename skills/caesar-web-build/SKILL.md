---
name: caesar-web-build
description: "How to build a CAESAR-style static site: no-build vanilla HTML/CSS/JS, tokens, Day/Night/Colour/Motion switches, accessibility and performance basics. Use when writing the code of a site. Triggers: zbuduj strone, kit.js, tokeny, dzien noc, static site, landing"
---

# Web build (static, no build step)

Related: [[caesar-web-direction]], [[caesar-web-motion]], [[caesar-client-preview]] (its `kit/` has the working switcher), [[caesar-webtools-sites]].

- Plain HTML, one CSS file with tokens (`--bg --fg --accent --radius --space-*`), one small JS file. No framework, no bundler, no remote fonts (self-host WOFF2), no analytics.
- `<html data-mode data-colour data-motion>`; set client-side only, remember in `localStorage`, default to the system preference. Every colour comes from tokens so Day and Night never fork the CSS.
- One section per screen on desktop, equal edges, real photographs or real UI, never stock gradients as content.
- Phone first at 428 px; touch targets 44 px; nothing hover-only; same functions on desktop and mobile.
- Semantic landmarks, visible focus, contrast 4.5:1, alt text, `lang`, meta and OG tags, `color-scheme`.
- Images: AVIF or WebP with width and height set; the hero image preloaded; lazy for the rest. Target LCP under 2.5 s on throttled mobile.
- Copy: plain, specific, no em dashes, no hype words. See [[caesar-public-copy]].
- Output goes to a release folder; deploy only on the operator's explicit word.
