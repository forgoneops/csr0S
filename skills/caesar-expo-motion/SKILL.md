---
name: caesar-expo-motion
description: "Use when animating in React Native or Expo: gestures, sheets, screen transitions, press feedback and haptics, and fixing motion that stutters on a device. Decide the thread, the properties, spring or timing, and how a gesture hands off."
---

# Motion in React Native and Expo

Same rules as `caesar-motion` (purpose first, transform and opacity, interruptible), plus the things that are specific to a native runtime.

## Which thread
- The JavaScript thread is busy with your app logic. An animation driven from it drops frames the moment it is busy. Run animation on the UI thread: Reanimated worklets and shared values, not `setState` per frame.
- Gestures too: handle them with Gesture Handler so they update shared values directly, without crossing to JS on each move.
- If an animation stutters only on a real device, assume thread contention first and profile on a release build, not a dev build.

## Which properties
`transform` (translate, scale, rotate) and `opacity` are cheap. Animating `width`, `height`, margins or layout forces a layout pass every frame: use `transform: scale` or Reanimated's layout transitions instead. Shadows and blur are costly on Android.

## Spring or timing
- Timing (duration plus easing) for fades and fixed transitions: 120–250 ms.
- Spring for anything the finger moved or a physical object: it keeps velocity. Start with moderate stiffness and enough damping that it settles with at most one small overshoot; tune by feel on the device.

## Gesture to animation hand-off
While the finger is down, the element follows it exactly (assign the shared value, no animation). On release, read the velocity from the gesture and pass it to `withSpring(target, { velocity })`, with the target chosen by projecting the end position from that velocity. Never restart from the resting position.

## Screens and sheets
Use the navigation library's native transitions for screens. For a bottom sheet: a pan gesture on the handle, snap points, a backdrop whose opacity follows the sheet position, and scrolling inside the sheet that only dismisses when at the top.

## Press feedback and haptics
Pressed state under 100 ms (scale 0.97 or opacity 0.7, nothing larger). Haptics (`expo-haptics`) on confirmations and selection changes only, light by default, never on every scroll tick, and never the only signal.

## Accessibility
Read the system reduce-motion setting (`useReducedMotion`) and replace movement with a fade. Animated elements keep their accessibility labels and roles; a gesture-only action has a visible button alternative.

## Check
Run a release build on a mid-range Android phone and an iPhone; watch with the performance monitor open; the UI thread frame rate stays near 60 while JS is deliberately busy.
