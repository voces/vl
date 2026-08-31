#!/usr/bin/env python3
"""Measure the standing goal directly.

    Every program the language design permits compiles and runs correctly.
      1. Soundness        — if `vl check` accepts it, it builds and runs correctly.
      2. No capability refusals — the compiler rejects only what the DESIGN forbids.
                                  "Not yet supported by codegen" is never a valid answer.

WHY THIS SCRIPT EXISTS. On 2026-08-30 the filed inventory graded `0 silent rows` and the
corpus graded `92 check-clean invalid wasm`. Both were correct — they are different
populations, 199 hand-written rows against 7,021 behavioural representatives — and the
first was reported as though it described VL. A goal nobody can measure in one command
gets reported from whichever number is nearest.

WHAT COUNTS AS PROGRESS, AND WHAT DOES NOT. The scoreboard is `runs`. Converting a silent
failure into a loud refusal moves a cell out of clause 1 and into clause 2; it does not
move `runs`, and under this goal it does not close anything. Twenty-five inventory rows
closed in five days that way. They are all still open here, by design.

    python3 scripts/goal-scoreboard.py [--baseline F] [--sites] [--json OUT]

Reads the corpus baseline, which `regress.py --write-baseline` keeps current. It does not
compile anything, so it is instant; run `regress.py <seed>` first if you need the numbers
to describe a seed other than the one the baseline was written from.
"""
import argparse, collections, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "silent-sweep", "distilled"))
from cellmap import load_cells  # noqa: E402

DEFAULT_BASELINE = os.path.join(HERE, "silent-sweep", "distilled", "baseline.jsonl")

# Clause 1: `vl check` said yes and the program did not then run correctly.
#
# THESE ARE THE GRADER'S CLASS STRINGS, NOT PROSE. `gradecensus.py` writes the trap-after-load
# class as `trap_loads`; this tuple spelled it `loads then traps` — the DOC vocabulary
# `check-filed-witnesses.py` matches in a status line — so the entry had never matched a cell
# and every trapping cell was invisible to clause 1. It went unnoticed because the corpus held
# no such cell until D741's witness (`d741_w0_base`, check rc 0 then `wasm trap: cast failure`)
# added the first two. `regress.py`'s own SILENT tuple has always said `trap_loads`; the two
# instruments now agree, which is the property that was missing rather than the spelling.
SILENT = ("check-clean invalid wasm", "check-clean silently wrong",
          "check-clean wrong evaluation", "trap_loads", "compiler trap")

# A refusal that CONCEDES the program is type-valid. These are the compiler naming its own
# capability gaps: the type system permits the program and the backend cannot lower it.
# Kept as the compiler's own words rather than a curated list, so a new gap is counted the
# day it is written instead of the day someone remembers to add it here.
CONCEDES = re.compile(
    r"no lowering|not yet supported|not supported by codegen|type-valid but cannot build",
    re.I)


def norm(msg):
    """Collapse a message to its shape so cells differing only in a type name group."""
    m = re.sub(r"`[^`]*`", "`X`", msg or "")
    m = re.sub(r"\d+", "N", m)
    m = re.sub(r"^(Error: )?(emit error\s*)?", "", m)
    return m.strip()[:118]


def capability_literals(root, corpus_text):
    """Every distinct MESSAGE LITERAL in `compiler/*.vl` that concedes the program is
    type-valid, each marked by whether the corpus reaches it.

    THE UNIT IS THE LITERAL, NOT THE "SITE", AND THAT WAS LEARNED THE HARD WAY. Two earlier
    versions of this function counted grep-matching LINES and tried to fingerprint each one
    against the corpus by slicing text off the source line. Both were wrong and each was
    wrong differently — 40 sites, then 26, then 23 with a 13-invisible split, and one of
    them reported `+` over an f64 list as a corpus blind spot when the corpus holds two
    cells for it. A line is not a message: interpolated messages are built from several
    literals and the slice picked up `+ tyToStr(eqBad) +`, which of course appears in no
    program's output. The literal that CARRIES the concession phrase is well defined, is
    what actually reaches a user, and is stable under how the call happens to be wrapped.

    Comment lines are skipped: a comment quoting a message is not a refusal.

    THE `ZERO` ROWS ARE THE POINT. The corpus is generated over fixed axes, so it can only
    score a gap it has a program for. Measured 2026-08-30: **9 of 14 literals are reached by
    no corpus cell** — the element-widening container copy among them, which refuses by hand
    and costs the scoreboard nothing. `runs` can therefore climb while those nine stand.
    Each needs a hand-written probe; none will arrive on its own.
    """
    lit_re = re.compile(r'"((?:[^"\\]|\\.)*)"')
    found = {}
    src = os.path.join(root, "compiler")
    for fn in sorted(os.listdir(src)):
        if not fn.endswith(".vl"):
            continue
        with open(os.path.join(src, fn), encoding="utf-8") as fh:
            for ln, line in enumerate(fh, 1):
                if line.lstrip().startswith("//"):
                    continue
                for m in lit_re.finditer(line):
                    t = m.group(1).strip()
                    if len(t) >= 12 and CONCEDES.search(t):
                        found.setdefault(t, f"{fn}:{ln}")
    return [(loc, t, t[:60] in corpus_text) for t, loc in sorted(found.items())]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", default=DEFAULT_BASELINE)
    ap.add_argument("--sites", action="store_true",
                    help="also list the compiler's self-declared capability refusal sites")
    ap.add_argument("--top", type=int, default=12)
    ap.add_argument("--json", metavar="OUT")
    a = ap.parse_args()

    cells = load_cells(a.baseline)
    total = len(cells)
    by = collections.Counter(v["class"] for v in cells.values())
    runs = by.get("runs", 0)

    silent = {k: v for k, v in cells.items() if v["class"] in SILENT}
    # Every emit reject reached the emitter, so `check` returned 0: the checker accepted a
    # program the backend then refused. Either it is legal and should compile, or it is
    # illegal and the CHECKER owed the diagnosis. Both are defects under clause 2.
    emit = {k: v for k, v in cells.items() if v["class"] == "loud emit reject"}
    conceded = {k: v for k, v in cells.items()
                if v["class"] == "loud check reject" and CONCEDES.search(v.get("msg", ""))}

    print(f"corpus: {total} cells   ({os.path.relpath(a.baseline)})")
    print()
    print(f"  SCOREBOARD   runs   {runs:5d} / {total}   {100*runs/total:5.2f}%")
    print()
    print(f"  clause 1  soundness violated       {len(silent):5d}  "
          f"(check rc 0, then no correct run)")
    print(f"  clause 2  emit rejected after check{len(emit):5d}  "
          f"(check rc 0, backend refused)")
    print(f"  clause 2  refusal concedes type-valid {len(conceded):3d}  "
          f"(checker refuses what the type system allows)")
    print(f"            ----------------------------------")
    print(f"            total against the goal   {len(silent)+len(emit)+len(conceded):5d}")
    print()
    for title, group in (("clause 1 — silent", silent),
                         ("clause 2 — emit reject", emit),
                         ("clause 2 — conceded", conceded)):
        if not group:
            continue
        c = collections.Counter(norm(v.get("msg", "")) for v in group.values())
        print(f"{title}: {len(group)} cells, {len(c)} distinct messages")
        for m, n in c.most_common(a.top):
            print(f"  {n:5d}  {m}")
        print()

    root = os.path.dirname(HERE)
    corpus_text = " \n".join(v.get("msg", "") for v in cells.values())
    sites = capability_literals(root, corpus_text)
    blind = [r for r in sites if not r[2]]
    print(f"  capability message literals in compiler/*.vl{len(sites):5d}")
    print(f"    of those, reached by NO corpus cell       {len(blind):5d}  "
          f"<- invisible to the scoreboard above")
    print()
    if blind:
        print("The corpus is generated over fixed axes, so it can only score a gap it has a")
        print("program for. `runs` can reach 100% with every site below still refusing.")
        print("`scripts/capability-probes/` holds a hand-written program per gap; run")
        print("`python3 scripts/capability-probes/run.py` to grade the ones covered so far.")
        print()
    if a.sites:
        for loc, text, hit in sites:
            print(f"  {'HIT ' if hit else 'ZERO'}  compiler/{loc:<22} {text[:60]!r}")
        print()
        print("  (a gap moved into typecheck.vl stops looking like a gap — the program")
        print("   compiles no better than before, so these count the same as emit-side ones)")
        print()

    if a.json:
        with open(a.json, "w") as fh:
            json.dump({"total": total, "runs": runs,
                       "clause1_silent": len(silent),
                       "clause2_emit_reject": len(emit),
                       "clause2_conceded": len(conceded),
                       "capability_literals": len(sites),
                       "capability_literals_uncovered": len(blind),
                       "by_class": dict(by)}, fh, indent=2, sort_keys=True)
        print(f"wrote {a.json}")


if __name__ == "__main__":
    main()
