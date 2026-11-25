---
name: caesar-caesaros-look
description: "CaesarOS only: the house look rules for any new CaesarOS surface (cut corners, theme tokens, own icons, plain name first, motion levels). Not for other projects; general skills stay neutral."
---

# CaesarOS look

Applies to work inside CaesarOS. For any other project use `caesar-ui-craft` and `caesar-motion` alone.

- Colours, spacing and shadows come from theme tokens, never literals.
- Shapes are cut corners and pixel squares. No pills, no circles (portraits get a clipped corner).
- Icons are the CaesarOS set. No emoji, no stock icon font; use the CaesarOS Select and Button, not native styled controls.
- One primitive per concern; no card inside a card.
- Plain name first, product name second.
- Motion follows the master level (Full, Reduced, Off) with a rule for each in the same change; UI motion under 300 ms; transform and opacity only.
- Everything works by touch and mouse at 390 and 1440 px, targets 48 px on a phone.
- The scar and the crystal always glow in Caesar art; text never sits on busy art.
