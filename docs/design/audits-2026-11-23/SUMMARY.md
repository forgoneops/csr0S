# Audits of 2026-11-23: summary with percentages

Estimates by claude-b from the crew's reports; "weighted" counts a partial as half.

| Audit | Counts | Weighted coverage | Strict (present only) |
|---|---|---|---|
| 1a. Old Caesar vs the new app | 52 capabilities, 3 out of scope: present 9, partial 29, missing 11 | 48% | 18% |
| 1b. Off Grid vs the new app | 55 functions, 1 decided out: present 5, partial 31, missing 18 | 38% | 9% |
| 2a. Accessibility, measured | 10 findings open, 13 checks passing (contrast 7.4 to 8.4:1, landmarks, alt text, text size) | about 70% | |
| 2b. New user walkthrough | rubric, see AUDIT-NEW-USER-2026-11-23.md | 55% | |
| 2. Clarity and accessibility together | | about 58% | |

Main reading: most pages are PARTIAL because the Atrium draws demo content for them; the work is replacing demo content with real data, not building new screens. Missing outright (high importance): Mail, Hermes configuration.
Accessibility, worst first: on the phone 25 of the first 40 Tab stops are off-screen; 7 switches without a name; 20 controls under 44px across 6 views; no h1 on app views; one animation ignores reduced motion; 2 apps are placeholders with no button.
Jev as a second opinion on "present, partial or missing": decided 7 of 13, agreed with the evidence-based crew rating on 2 of 7, and called Mail present when no mail route exists. Not reliable for checking presence; keep the crew and code evidence as the base.
