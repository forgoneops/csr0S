---
name: caesar-method-spec
description: "Use before building anything new or changing behaviour when something non-trivial is unclear: find out what the person wants and why, lay out approaches, get a short design approved. Skip for small, fully specified tasks."
---

# Spec first (find out what they want)


Your belief about what they want is thinner than it feels. A short exchange now saves a rebuild later.

1. **Ask yourself what you know.** Everything that matters is in the request (change a colour, rename a label)? Do it and say what you did. Something that would change what gets built is missing? Start the exchange.
2. **Look before you ask.** Read the plan row, the handoff, the files they pointed at, the code the change touches. Never ask what the project already answers or reopen what is decided.
3. **First message, about 200 words:** say the request back in your own words (what, for whom, why), what you found that bears on it, and anything that changes the ask (a conflict, a cheaper path). End with ONE question, the one whose answer changes the build most, with the options named and the trade-offs. If they did not ask for a discussion, add "or say go and I start".
4. **Approaches in their own message.** Two or three, each with what it costs, and the one you would pick. They choose.
5. **A short design** (what, how it fits the contracts between blocks, what you will not do), approved before code. Size it to the work: three lines for a small change.
6. Then write the plan (`caesar-method-plan`).

Not a reason to stop: a spike they agreed to, or work they told you to do without questions. In both, state the one big choice you made in a plain line.
