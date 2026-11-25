---
name: caesar-method-tdd
description: "Use when implementing a feature or fixing a bug, before writing the implementation: write the failing test first, watch it fail for the right reason, then write the least code that passes."
---

# Test first


If you did not watch the test fail, you do not know it tests the right thing.

1. **Red.** One small test for one behaviour, named for what should happen, using real code and not a stack of mocks.
2. **Watch it fail.** Run it. It must fail because the behaviour is missing, not because of a typo or an import. Wrong failure: fix the test.
3. **Green.** The least code that passes. No extras, no "while I am here".
4. **Run everything.** Your test and the rest stay green.
5. **Refactor** only while green. Then the next behaviour.

Rules that keep it honest:
- Code written before its test is thrown away and rewritten from the test, not kept as a reference.
- A bug fix starts with a test that reproduces the bug. Revert the fix once and see the test fail, restore it and see it pass; otherwise the test proves nothing.
- A test you cannot make fail is not a test.
- Exceptions need the owner's word: throwaway prototypes, generated code, plain config.

Here: `bun test tests/<file>.test.ts` while working, then the whole `bun test`, `bunx tsc --noEmit -p .` and `bun tools/leak-check.ts` before a commit.
