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

    scripts/inventory/ls.py --reserve D1520-D1539 vl-6a "VL-003/4/5"
    scripts/inventory/ls.py --release D1520-D1539

`--next` SKIPS RESERVED RANGES and says which it skipped and who holds them. Reserved blocks
used to be "a coordination convention written down in the README, because two agents running
this one second apart both get the same answer" — that convention failed four times, the last
of them two sessions colliding while actively coordinating about ids in the same conversation.
The reservations live in `docs/internals/inventory/RESERVED.md`; a stale one (every id filed)
is a red in `tests/vl_inventory_rows_test.ts`, not a note. Claim the block, then mint inside it.
"""
import datetime
import pathlib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rows as R  # noqa: E402

MARKER = ("<!-- reservations below; the marker is what "
          "--reserve/--release edit around -->")
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
            # A status block longer than the six lines `status_line` joins (D1025's is
            # seven) returns None there; the outcome word opens the block, so the first
            # bold line alone still classifies it — the grader reads it the same way.
            first_bold = next((ln.strip("*").strip() for ln in body.split("\n")
                               if ln.startswith("**")), "")
            out.append((b.rid, R.declared_outcome(S.status_line(body) or first_bold) or "?",
                        b.title, doc))
    return sorted(out, key=lambda r: R.id_key(r[0]))


RESERVED_DOC = R.CHECKER.resolve().parents[1] / "docs/internals/inventory/RESERVED.md"
# The HOLDER may contain spaces ("vl-6a sweep agent"), so it runs non-greedily up to the
# date rather than being one token — `(\S+)` silently parsed zero lines and `--next`
# handed back a reserved id, which is the exact failure this file exists to stop.
RANGE = re.compile(r"^D(\d+)-D(\d+)\s+(.+?)\s+(\d{4}-\d{2}-\d{2})\s*(.*)$")


def reservations(doc=None):
    """Every live range as (lo, hi, holder, date, note). Absent file = no reservations."""
    path = pathlib.Path(doc) if doc else RESERVED_DOC
    if not path.is_file():
        return []
    out = []
    for ln in path.read_text(encoding="utf-8").split("\n"):
        m = RANGE.match(ln.strip())
        if m:
            out.append((int(m.group(1)), int(m.group(2)), m.group(3), m.group(4),
                        m.group(5).strip()))
    return sorted(out)


def holder_of(n, res):
    """The reservation covering id `n`, or None — `--next` skips these."""
    for lo, hi, who, date, note in res:
        if lo <= n <= hi:
            return (lo, hi, who, date, note)
    return None


def stale_ranges(res, filed):
    """Ranges whose every id is already filed: the work landed, the block should go back."""
    out = []
    for lo, hi, who, date, note in res:
        if all(n in filed for n in range(lo, hi + 1)):
            out.append((lo, hi, who, date, note))
    return out


def cmd_reserve(spec, holder, note, release=False):
    m = re.match(r"^D(\d+)-D(\d+)$", spec)
    if not m:
        print(f"ls.py: range must read D<lo>-D<hi>, got {spec!r}")
        return 2
    lo, hi = int(m.group(1)), int(m.group(2))
    if lo > hi:
        print(f"ls.py: {spec} runs backwards")
        return 2
    res = reservations()
    if release:
        keep = [r for r in res if (r[0], r[1]) != (lo, hi)]
        if len(keep) == len(res):
            print(f"ls.py: no reservation exactly D{lo}-D{hi} to release")
            return 2
    else:
        clash = next((r for r in res if not (hi < r[0] or lo > r[1])), None)
        if clash:
            print(f"ls.py: D{lo}-D{hi} overlaps D{clash[0]}-D{clash[1]}, held by "
                  f"{clash[2]} since {clash[3]}" + (f" ({clash[4]})" if clash[4] else ""))
            return 1
        keep = res + [(lo, hi, holder, datetime.date.today().isoformat(), note or "")]
    body = RESERVED_DOC.read_text(encoding="utf-8")
    head = body.split(MARKER)[0] + MARKER + "\n\n"
    lines = [f"D{a}-D{b}  {w}  {d}" + (f"  {nt}" if nt else "")
             for a, b, w, d, nt in sorted(keep)]
    RESERVED_DOC.write_text(head + "\n".join(lines) + "\n", encoding="utf-8")
    print(("released " if release else "reserved ") + f"D{lo}-D{hi}")
    return 0



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
        elif a in ("--reserve", "--release"):
            spec = next(it)
            who = next(it, "") if a == "--reserve" else ""
            note = next(it, "") if a == "--reserve" else ""
            return cmd_reserve(spec, who, note, release=(a == "--release"))
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
        res = reservations()
        n = (max(nums) + 1) if nums else 1
        # Walk past every reserved block, remembering each so the caller can see WHO to talk
        # to. A bare number would send them straight back into the collision this prevents.
        skipped = []
        while True:
            hit = holder_of(n, res)
            if not hit:
                break
            skipped.append(hit)
            n = hit[1] + 1
        print(f"D{n}")
        for lo, hi, who, date, note in skipped:
            print(f"  skipped D{lo}-D{hi} — {who}, {date}"
                  + (f", {note}" if note else ""), file=sys.stderr)
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
