---
name: caesar-touch
description: "Use when a web app must feel native on a phone or tablet: touch targets, gestures (swipe, drag, long press, sheets), momentum and interruption, viewport and safe-area handling, input zoom, sticky hover, pull-to-refresh, PWA install. Test on real hardware."
---

# Touch and mobile web

A site feels installed when the small things are right. Check each; every one has bitten real projects.

## Targets and taps
- Targets at least 44 px (48 is better), with 8 px between neighbours. Make the hit area larger than the visuals with padding, not by growing the icon.
- Remove the grey tap flash (`-webkit-tap-highlight-color: transparent`) only if you provide your own pressed state.
- Kill the 300 ms delay with `touch-action: manipulation` on controls and a proper `<meta name="viewport">`.
- Hover styles go inside `@media (hover: hover)`, otherwise they stick after a tap.
- Long press must not select button text: `user-select: none` on controls, never on content people may copy.

## Viewport and layout
- Use `100dvh` (or `svh` for something that must not jump), not `100vh`, so the address bar does not hide the bottom.
- Respect notches and the home indicator with `env(safe-area-inset-*)`, and set `viewport-fit=cover` when you draw edge to edge.
- Inputs below 16 px make iOS zoom the page on focus. Keep form text at 16 px or more.
- Fixed bars and a soft keyboard fight: test with the keyboard open, and keep the focused input visible (`scrollIntoView({block: "center"})` after the keyboard animation).
- Match the browser chrome with `theme-color` and, for an installed app, the status-bar style.

## Scrolling
- Do not hijack the native pull-to-refresh or rubber band unless you replace them. `overscroll-behavior: contain` on inner scrollers stops scroll chaining.
- Carousels: `scroll-snap-type` with `touch-action: pan-x` (or `pan-y`) so a diagonal swipe goes to the intended axis.
- Never put a horizontal scroller inside a horizontal gesture area without deciding who owns the swipe.

## Gestures
- Decide the axis after about 8–10 px of movement, then lock it. A vertical scroll must win over a horizontal swipe that began diagonally.
- A drag follows the finger one to one. On release, project the end point from the velocity (a flick of 0.5 px/ms or more commits; below that, snap to the nearest state) and animate from the release position with that velocity so nothing jumps.
- Past a limit, resist: map further movement with a falling curve (rubber band) instead of stopping dead.
- Gestures are shortcuts, never the only way. Every swipe action also exists as a visible control.
- Sheets: a drag handle, a backdrop that closes on tap, dismiss by flicking down only when scrolled to the top of the sheet's content.
- Use pointer events (`pointerdown/move/up`, `setPointerCapture`) rather than separate touch and mouse code, and handle `pointercancel`.

## Feedback
Pressed state within one frame. Haptics only where the platform allows it and only for confirmations, never decoration. Respect reduced motion.

## PWA basics
Manifest with name, icons (192, 512, maskable), `display: standalone`, a service worker that serves the shell offline, a start URL inside scope. Verify installability in the browser's application panel and on a device.

## Test on a real phone
An emulator misses the keyboard, the address bar, momentum, safe areas and thermal throttling. Test one real device before you call it done, with the keyboard open and in both orientations.
