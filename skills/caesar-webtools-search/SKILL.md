---
name: caesar-webtools-search
description: Find the look for a website, shop, app or landing page before building it: a design search with references, what to take from each, and a brief that goes to Canon. Use when asked to find inspiration, references or design directions, to scout designs, or to start a new site for a client. Triggers: inspiracja, referencje, design search, Speculatores, szukaj wzorów, brief, skauci.
---

# Speculatores: design search (Web tools, third room)

A **search** has an idea, a kind (business website, shop, app or dashboard, landing page, portfolio, booking site), four short answers (who it is for, the feel, what it must not look like, what it must have) and a **board** of references. Each reference carries proof read from the page itself: title, description, fonts and the main colours. You write **what to take from it**; the operator loves the ones he likes. The brief is made from the loved references (or all, if none is loved) and becomes a design system in Canon.

## For an agent asked to scout
Take six angles, one scout each: the first screen and hero; typography; colour and mood; layout, grid and rhythm; motion and small interactions; photography and how content is shown. For each, find one real, current, well-designed site that does it best for this brief (not a template gallery) and add it:

`POST /api/p/webtools/specul/runs/<id>/refs {"url": "<address>", "take": "<what to take, one sentence>", "by": "scout"}`

Then say in two lines which six addresses and what you took from each. **Combine elements, never copy one site.** Private and local addresses are refused; a page that cannot be read still lands on the board and the operator notes what it does.

## API
`GET /specul/meta`, `GET|POST /specul/runs`, `GET|DELETE /specul/runs/<id>`, `POST|DELETE /runs/<id>/refs[/<ref>]`, `GET|POST /runs/<id>/brief` (POST writes it into Canon; operator only), `POST /runs/<id>/scouts` (puts a request in Activity; approving asks Caesar to scout; operator only).

## After the search
Take the brief into Canon and make it a real system (a name, a palette you chose, a display font), check the "Looks like" warning (no two clients get the same look), then build the pages in Fabrica. Say afterwards what was taken from which reference.

## Rules
References are inspiration only: other people's work is never shown on a client's site. Send scouts only with the operator's yes (it spends model time). Nothing is published from here.
