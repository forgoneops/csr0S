#!/usr/bin/env python3
"""Scan text for AI-slop tells, English and Polish.

    python3 scan.py draft.md            # files
    cat draft.md | python3 scan.py -    # stdin
    python3 scan.py --quiet draft.md    # counts only

Prints `file:line: [id] match` per hit, then a summary. Exit 1 when anything is found, so it can gate a
commit or a build step. The list is deliberately narrow: every pattern here is defensible in a review, and
none of them is a style preference dressed as a rule.
"""
import re
import sys

# (id, regex, why) — English and Polish, case-insensitive
PATTERNS = [
    ("em-dash", r"—", "em dash: use a comma, colon or full stop"),
    ("binary-contrast", r"\b(?:this|it|that)\s+is\s+not\s+[^.]{1,60}[.;,]\s*(?:it|this|that)\s+is\b",
     "'not X. It is Y.' states Y twice; state Y once"),
    ("binary-contrast-pl", r"\bto\s+nie\s+[^.]{1,60}\.\s*to\s+", "'To nie X. To Y.' — powiedz Y raz"),
    ("throat-clearing", r"\b(?:here'?s the thing|let me be clear|i'?ll be honest|the uncomfortable truth)",
     "delete the runway, start with the point"),
    ("throat-clearing-pl", r"\b(?:warto (?:zauważyć|podkreślić|zaznaczyć)|należy (?:zauważyć|podkreślić|zaznaczyć))",
     "usuń wstęp, zacznij od tezy"),
    ("faux-insight", r"\b(?:what nobody tells you|most people (?:miss|get wrong)|the part (?:everyone|most people) (?:misses|skip))",
     "the claim should stand without the flattery"),
    ("faux-insight-pl", r"\b(?:mało kto (?:o tym )?wie|większość (?:ludzi )?tego nie wie|nikt o tym nie mówi)",
     "teza bez wstępu o wtajemniczonych"),
    ("weasel-attribution", r"\b(?:experts agree|studies show|research shows|industry reports|widely regarded|many argue)",
     "name the source or cut the claim"),
    ("weasel-attribution-pl", r"\b(?:eksperci są zgodni|badania (?:pokazują|wskazują)|jak powszechnie wiadomo)",
     "nazwij źródło albo usuń twierdzenie"),
    ("importance-puffery", r"\b(?:stands as a testament|marks a pivotal moment|plays a (?:vital|crucial) role|solidifies its position|underscores its significance)",
     "state the fact; let the reader judge the weight"),
    ("importance-puffery-pl", r"\b(?:odgrywa (?:kluczową|istotną) rolę|stanowi (?:kamień milowy|przełom)|podkreśla (?:znaczenie|wagę))",
     "fakt zamiast oceny wagi"),
    ("metadiscourse", r"\b(?:the key point is|as you can see|that (?:distinction|last part) matters|in other words)",
     "do not tell the reader how to read"),
    ("metadiscourse-pl", r"\b(?:kluczowe jest to, że|jak widać|innymi słowy|to rozróżnienie ma znaczenie)",
     "nie instruuj czytelnika"),
    ("summary-ending", r"\b(?:in conclusion|to sum up|all in all|at the end of the day)\b",
     "the reader was just there; end on the last concrete point"),
    ("summary-ending-pl", r"\b(?:podsumowując|reasumując|wnioski nasuwają się|koniec końców)\b",
     "zakończ na ostatnim konkretnym zdaniu"),
    ("rhetorical-setup", r"\b(?:what if i told you|plot twist|think about it:|imagine a world)",
     "drop the setup and make the point"),
    ("rhetorical-setup-pl", r"\b(?:wyobraź sobie|a co, jeśli powiem|czy zastanawiałeś się)",
     "bez wstępu retorycznego"),
    ("colon-reveal", r":\s+[a-ząćęłńóśźż][^.!?\n]{0,60}$",
     "colon reveal: write the sentence instead"),
    ("fake-strong-verb", r"\bserves? as (?:a|an|the) \w+", "say what it does"),
    ("fake-strong-verb-pl", r"\b(?:stanowi|pełni funkcję) (?:swoisty|coś w rodzaju)", "powiedz, co robi"),
    ("synonym-cycling", r"\b(?:the tool|the agent|the assistant|the platform)\b.{0,80}\b(?:the tool|the agent|the assistant|the platform)\b",
     "one word per idea; check for rotation"),
]

WORDS = [
    "delve", "foster", "leverage", "utilize", "facilitate", "empower", "streamline", "robust",
    "cutting-edge", "paradigm shift", "game changer", "tapestry", "realm", "beacon", "multifaceted",
    "meticulous", "intricate", "paramount", "transformative", "elevate", "embark", "supercharge",
    "harness", "ever-evolving", "seamless", "unlock",
    "dedykowany", "kompleksowy", "holistyczny", "synergia", "innowacyjny", "przełomowy", "rewolucyjny",
    "niezbędny", "zoptymalizowany", "wykorzystać", "zapewnić", "umożliwić",
    "kompleksowe podejście", "zmienia zasady gry", "gra warta świeczki",
]


def scan(text, name):
    hits = []
    lines = text.split("\n")
    for ln, line in enumerate(lines, 1):
        for pid, rx, why in PATTERNS:
            for m in re.finditer(rx, line, re.I):
                frag = m.group(0).strip()
                if len(frag) > 70:
                    frag = frag[:67] + "..."
                hits.append((ln, pid, frag, why))
        for w in WORDS:
            for m in re.finditer(r"\b" + re.escape(w) + r"\b", line, re.I):
                hits.append((ln, "word", m.group(0), f"cut '{w}' or replace it with the concrete thing"))
    return hits


def main(argv):
    quiet = "--quiet" in argv
    args = [a for a in argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        return 2
    total = 0
    for path in args:
        try:
            text = sys.stdin.read() if path == "-" else open(path, encoding="utf-8").read()
        except OSError as e:
            print(f"scan: {e}", file=sys.stderr)
            return 2
        hits = scan(text, path)
        total += len(hits)
        if not quiet:
            for ln, pid, frag, why in hits:
                print(f"{path}:{ln}: [{pid}] {frag} — {why}")
        print(f"{path}: {len(hits)} hit(s)")
    print(f"total: {total}")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
