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
SILENT = ("check-clean invalid wasm", "check-clean silently wrong",
          "check-clean wrong evaluation", "loads then traps", "compiler trap")

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


def capability_sites(root):
    """Refusal sites in the compiler whose own message concedes type-validity.

    Greppable on purpose. Clause 2 is otherwise the kind of bar that gets argued rather
    than measured — and the argument always resolves in favour of whoever is tired.
    """
    out = collections.Counter()
    src = os.path.join(root, "compiler")
    for fn in sorted(os.listdir(src)):
        if not fn.endswith(".vl"):
            continue
        for line in open(os.path.join(src, fn), encoding="utf-8"):
            if CONCEDES.search(line) and '"' in line:
                out[fn] += 1
    return out


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

    if a.sites:
        root = os.path.dirname(HERE)
        sites = capability_sites(root)
        print(f"compiler refusal sites conceding type-validity: {sum(sites.values())}")
        for fn, n in sites.most_common():
            print(f"  {n:5d}  compiler/{fn}")
        print("  (a gap moved into typecheck.vl stops looking like a gap — the program")
        print("   compiles no better than before, so these count the same as emit-side ones)")
        print()

    if a.json:
        with open(a.json, "w") as fh:
            json.dump({"total": total, "runs": runs,
                       "clause1_silent": len(silent),
                       "clause2_emit_reject": len(emit),
                       "clause2_conceded": len(conceded),
                       "by_class": dict(by)}, fh, indent=2, sort_keys=True)
        print(f"wrote {a.json}")


if __name__ == "__main__":
    main()
