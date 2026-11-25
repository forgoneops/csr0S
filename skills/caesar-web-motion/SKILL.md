---
name: caesar-web-motion
description: "Motion for websites: when to animate, CSS vs Motion library, scroll and entrance effects, performance and reduced motion. Use when adding or fixing animation on a site. Triggers: animacja strony, motion.dev, scroll, hero entrance, stagger, plynnosc, reduced motion"
---

# Web motion

Related: [[caesar-web-direction]], [[caesar-web-build]], [[caesar-design]]. Generic motion skills (`animate`, `choreograph`, `animation-performance`) apply too; this adds the CAESAR rules.

- **Order**: CSS transitions and `@starting-style` first; WAAPI second; the Motion library (motion.dev, `animate`, `scroll`, `inView`, springs, stagger) only for sequences, scroll-linked effects and springs.
- **Self-host** the `motion` ES module (about 3 kB for mini `animate`) in the site folder. No CDN, no remote scripts. Never run `npx motion-ai`: it configures hosted MCP servers.
- **Animate only** `transform` and `opacity`. Blur and big shadows only on small areas.
- **One hero entrance and one or two dealt moments per page.** Everything else is quiet hover and focus feedback.
- **Safety**: no strobing, no full-frame flashes, fades and wipes over hard cuts. Honour `prefers-reduced-motion` and the site's Motion switch (off / calm / full), with soft transitions between modes.
- Inventory every motion source, not just CSS: recursive `requestAnimationFrame` loops, canvas/WebGL draws, intervals, WAAPI/Motion animations, and deferred scroll/`inView` callbacks. Motion-off and reduced-motion paths must stop rescheduling or pause active work, and prevent deferred callbacks from starting new animation; make resume idempotent. Verify reduced motion from a fresh page load and after a preference change when the harness dispatches that event. If emulation changes `matchMedia().matches` without delivering `change`, mark the transition path unobserved instead of calling it passed.
- **Check real fps** in a browser under CPU throttling, not by reading the code. A page that drops frames fails the gate.
- **Effect catalogue** (vanilla, MIT, vet licence before use): Cobe, Torph, MagnetType, FloodText, color4bg, blobs, css-doodle, curtains.js, VFX-JS, tsParticles. Shader and particle scenes only on tech or gaming pages.
