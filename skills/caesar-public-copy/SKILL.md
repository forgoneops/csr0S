---
name: caesar-public-copy
description: "Write text that will be public in the user's name: posts, captions, release notes, newsletters, site copy, replies. Audience and channel first, facts copied from their source, the user's voice from samples, a check before anyone sees it, and nothing sent or posted by an agent. Use for any public or customer-facing copy. Triggers: post, caption, opis, release notes, newsletter, tekst na strone, odpowiedz, publikacja, copy, tresc"
---

# Public copy

The behaviours (audience before text, facts from source, a review gate, no claim of sending without evidence) are from the OMH content-operator workflow, in CAESAR's terms.

1. **Know the voice**: read the user's card for the Writer or Social role (`caesar-grill-writer`, `caesar-grill-social`) and the writing-style note in the vault. If there are no samples of the user's own writing, ask for three.
2. **Audience, channel, goal, length** before the first word. One sentence on what the reader should do after.
3. **Facts from the source, not memory**: a version, a command, a count, a price, a name is copied exactly from where it lives (the README, `--help`, the product page, the changelog). If you cannot find it, mark it and ask. Never invent numbers, quotes or results.
4. **Counts agree with their nouns** in the language of the text (0, 1 and 2 things).
5. **Plain, sharp, no filler. No em dashes in public text.** No AI tells ("delve", "in today's fast-paced world", lists of three adjectives).
6. **No private data**: client names, real addresses, tailnet or LAN addresses, local paths, keys. Names and photos of real people only with their yes.
7. **Check before anyone sees it**: the Social desk runs the public-text check (`plugins/social/lint.ts`) before a draft can be sent for approval.
8. **Nothing is sent or posted by an agent.** A draft goes to the operator for approval (`caesar-social`); he posts it. Say "drafted" and "approved", never "published", unless he told you he posted it.
