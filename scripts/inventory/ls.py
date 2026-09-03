#!/usr/bin/env python3
"""
List the filed inventory rows — id, status, title — from EITHER form of the inventory.

WHAT IT REPLACES. `grep '^### D' docs/internals/silent-class-inventory.md | tail` was how
people read the queue and minted the next id. Once the rows are one file per row that grep
answers nothing, and it was never a good answer anyway: it prints the row's headline prose,
not the status the grader reads, so a row titled `[CLOSED …]` whose status line says
otherwise looked closed. This reads the SAME status vocabulary
`scripts/check-filed-witnesses.py` grades against, so the two cannot disagree.

    scripts/inventory/ls.py                     # every row, id order
    scripts/inventory/ls.py --status open       # the rows that DO NOT RUN
    scripts/inventory/ls.py --status silent     # check-clean invalid wasm / wrong value
    scripts/inventory/ls.py --status runs       # or any canonical outcome by name
    scripts/inventory/ls.py --tail 10           # the last rows filed, in id order
    scripts/inventory/ls.py --next              # the lowest id no row claims

`--next` is a convenience, NOT a reservation: reserved id BLOCKS remain a coordination
convention written down in the inventory README, because two agents running this one second
apart both get the same answer. Claim the block first, then mint inside it.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rows as R  # noqa: E402
import split as S  # noqa: E402

# `open` is the question people actually ask ("which rows are non-running"); the rest are
# the grader's own canonical outcomes, so `--status` never invents a vocabulary.
GROUPS = {
    "open": lambda o: o != "runs",
    "closed": lambda o: o == "runs",
    "silent": lambda o: o.startswith("silent_"),
    "loud": lambda o: o.endswith("_reject"),
}


def rows_of(target):
    """(id, outcome, title, path) per row, id order, from a directory or a monolith."""
    out = []
    for doc in R.resolve(target):
        text = Path(doc).read_text()
        for b in R.parse_blocks(text):
            if b.kind != "row":
                continue
            body = R.strip_separator(b.text)
            out.append((b.rid, R.declared_outcome(S.status_line(body) or "") or "?",
                        b.title, doc))
    return sorted(out, key=lambda r: R.id_key(r[0]))


def main(argv):
    want, tail, nxt, targets = None, None, False, []
    it = iter(argv)
    for a in it:
        if a == "--status":
            want = next(it)
        elif a == "--tail":
            tail = int(next(it))
        elif a == "--next":
            nxt = True
        elif a.startswith("--"):
            print(__doc__)
            return 2
        else:
            targets.append(a)
    targets = targets or [d for _, d in S.SOURCES]

    # Sorted ACROSS targets, so `--tail` answers "the most recently minted ids" rather
    # than "the tail of whichever inventory was listed last".
    allrows = sorted((r for t in targets for r in rows_of(t)), key=lambda r: R.id_key(r[0]))
    if nxt:
        nums = [R.id_key(r[0])[1] for r in allrows]
        print(f"D{max(nums) + 1}" if nums else "D1")
        return 0
    picked = allrows
    if want:
        pred = GROUPS.get(want, lambda o, w=want: o == w)
        picked = [r for r in allrows if pred(r[1])]
    if tail:
        picked = picked[-tail:]
    w = max([len(r[0]) for r in picked] + [3])
    for rid, outcome, title, _doc in picked:
        print(f"{rid:<{w}}  {outcome:<22} {title}")
    print(f"\n{len(picked)} of {len(allrows)} rows"
          + (f" · --status {want}" if want else "")
          + " · " + ", ".join(str(t) for t in targets))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
