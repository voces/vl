#!/usr/bin/env python3
"""
Refuse an inventory whose rows have been SPLICED by a merge resolution.

    scripts/inventory/splice-scan.py                       # both inventories
    scripts/inventory/splice-scan.py docs/internals/inventory
    scripts/inventory/splice-scan.py <file-or-dir> ...

Non-zero exit on any finding, so it can gate.

WHY THIS EXISTS AND WHY THE OTHER INSTRUMENTS CANNOT SEE IT. Two sessions append rows to
one file's tail every hour, and "keep both sides" is the resolution that looks right. It
is not: it can leave one row carrying a second row's body, or a duplicate copy of its
own. `check-filed-witnesses.py` still passes such a row — it reads the FIRST status line
and the FIRST repro block, both of which are intact — and `vl_inventory_rows_test.ts`
passes for the same reason. D1013 sat spliced through several green gates on 2026-09-02
before a hand scan found it, and a spliced row SPLITS BADLY: `split.py` writes one file
per `### D`, so the tail half lands inside the wrong row's file.

THREE CHECKS, each with its own exit-worthy finding:

* DUPLICATE ID — two `### D<id>` headings claiming one id. Citations become ambiguous and
  the split writes one file twice.
* TWO STATUS LINES — a row whose body holds more than one bold status block. Exactly one
  is the contract every consumer assumes.
* STATUS TOO FAR — the grader joins at most 6 lines looking for the bold status, so a
  7-line block reads as "no status line at all" and reds the rows test. The limit is read
  off the grader rather than restated, because a second copy would drift.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rows as R  # noqa: E402

# The grader's own scan bound, read from its source so the two cannot disagree.
_SRC = R.CHECKER.read_text(encoding="utf-8")
_M = re.search(r"scanned\s*<\s*(\d+)", _SRC)
STATUS_JOIN_LIMIT = int(_M.group(1)) if _M else 6

# TWO CUTS OF THIS CHECK WERE WRONG BEFORE THIS ONE, and both were wrong the same way —
# too broad against a tree that was clean.
#
#   "a bold line"                        -> 107 findings; rows open paragraphs with `**`.
#   "a bold line naming an outcome"      ->  42 findings; `declared_outcome` reads its
#                                            vocabulary anywhere in the line, so a bold
#                                            lead-in like `**WHAT CLOSED IT…**` parses.
#
# The signal a SPLICE actually leaves is a DUPLICATED status — D1013 carried two copies of
# its own opening line. So the check is: a later bold outcome line whose opening is the
# same as the row's first. Prose lead-ins do not repeat the status; a spliced body does.
STATUS = re.compile(r"^\*\*")
STATUS_HEAD = 48        # chars of the opening compared; a splice repeats far more than this


def is_status(line):
    return bool(STATUS.match(line)) and R.declared_outcome(line) is not None


def findings(path):
    """(kind, id, line, detail) for every splice symptom in one inventory."""
    # `resolve` answers a LIST of concrete files — the doc itself, or one per split row.
    # Scanning them as one text is what makes a duplicate id across two row FILES visible,
    # which is the split's own version of the splice this catches in the monolith.
    text = "\n".join(Path(f).read_text(encoding="utf-8") for f in R.resolve(path))
    out, seen = [], {}
    for b in R.parse_blocks(text):
        if b.kind != "row":
            continue
        if b.rid in seen:
            out.append(("duplicate-id", b.rid, b.start,
                        f"also at line {seen[b.rid]}"))
        seen[b.rid] = b.start
        body = b.text.split("\n")[1:]
        statuses = [i for i, ln in enumerate(body) if is_status(ln)]
        if statuses:
            head = body[statuses[0]][:STATUS_HEAD]
            for j in statuses[1:]:
                if body[j][:STATUS_HEAD] == head:
                    out.append(("duplicated-status", b.rid, b.start + 1 + j,
                                "repeats the row's own status line — a spliced body"))
        if statuses and statuses[0] >= STATUS_JOIN_LIMIT:
            out.append(("status-too-far", b.rid, b.start + 1 + statuses[0],
                        f"status starts {statuses[0]} lines in; the grader joins at most "
                        f"{STATUS_JOIN_LIMIT} and reads a later one as ABSENT"))
    return out


SELF_TEST = [
    ("duplicated-status",
     "### D9001 — spliced\n\n**closed · was check-clean invalid wasm · clause 1 · `t.vl`**\n\n"
     "prose\n\n**closed · was check-clean invalid wasm · clause 1 · `t.vl`**\n\nmore\n\n"
     "Repro:\n\n    print(1)\n"),
    ("duplicate-id",
     "### D9002 — first\n\n**closed · runs**\n\nRepro:\n\n    print(1)\n\n"
     "### D9002 — second\n\n**closed · runs**\n\nRepro:\n\n    print(2)\n"),
    ("status-too-far",
     "### D9003 — far\n\n1\n2\n3\n4\n5\n6\n7\n\n**closed · runs**\n\nRepro:\n\n    print(1)\n"),
]


def self_test():
    """Each check must FIRE on a specimen built to trip it.

    Two earlier cuts of the duplicated-status rule were too broad and reported 107 and 42
    findings against a clean tree. A scan nobody has watched fire — or watched STOP firing
    — is worth nothing, so the specimens live here rather than in a scratch directory.
    """
    import tempfile
    bad = 0
    for want, text in SELF_TEST:
        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as f:
            f.write(text)
            path = f.name
        kinds = [k for k, _, _, _ in findings(path)]
        ok = want in kinds
        print(f"  {want:<20} {'fires' if ok else 'DID NOT FIRE'}  {kinds}")
        bad += 0 if ok else 1
    print(f"{len(SELF_TEST)} specimens · {len(SELF_TEST) - bad} fire · {bad} silent")
    return 1 if bad else 0


def main(argv):
    if argv and argv[0] == "--self-test":
        return self_test()
    targets = argv or ["docs/internals/silent-class-inventory.md",
                       "docs/internals/silent-class-inventory-2.md"]
    bad = 0
    for t in targets:
        p = Path(t)
        if not p.exists():
            continue
        for kind, rid, line, detail in findings(t):
            print(f"{t}:{line}  {kind}  {rid} — {detail}")
            bad += 1
    print(f"\nsplice scan: {bad} finding(s)" + ("" if bad else " — clean"))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
