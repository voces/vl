#!/usr/bin/env python3
"""The comment-budget ratchet — the tree-wide half of `comment-block-too-long`.

Same two clauses as compiler/lint.vl's rules, over the same block definition and
the same two budgets — 12 lines a block, 40 a module header — so the numbers agree
file by file (tests/vl_comment_budget_test.ts pins that).
Per-file counts may only FALL: `--check` fails when any file exceeds its
baseline, `--write-baseline` lowers it after a trim lands. See CLAUDE.md,
"Comments state the invariant; measurements live in the inventory".
"""

import json
import os
import sys

BUDGET = 12
# A module HEADER earns more room: it is the file's contract, not a note beside one
# line. #2413's trim pilot set the number; both implementations read it from here.
HEADER_BUDGET = 40
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE = os.path.join(ROOT, "scripts", "comment-budget-baseline.json")
TOO_LONG = "comment-block-too-long"
UNCITED = "comment-measurement-uncited"
CODES = (TOO_LONG, UNCITED)

WORD = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_")
DIGIT = set("0123456789")
UNITS = ("cells", "cell", "rows", "row", "bytes", "classes", "class", "programs", "program")
VERDICTS = ("loud", "silent")
# Sources are read as BYTES decoded latin-1, so an index here is a BYTE index —
# the same unit `s[i]` is in VL (strings are bytes since stage 2c). Any non-ASCII
# needle has to be spelled in that same encoding.
ARROW = "runs \u2192 not-runs".encode("utf-8").decode("latin-1")


def _at(s, i):
    return s[i] if 0 <= i < len(s) else ""


def _digits(s, i):
    """End of the digit/comma run starting at i, or i when there is none."""
    j = i
    while j < len(s) and (s[j] in DIGIT or s[j] == ","):
        j += 1
    while j > i and s[j - 1] == ",":
        j -= 1
    return j


def _spaces(s, i):
    j = i
    while j < len(s) and s[j] == " ":
        j += 1
    return j


def _num_starts(s):
    """Every index where a digit run begins on a WORD BOUNDARY, so `i32` and
    `f64` never read as the number 32 / 64 (CLAUDE.md's `iN` lesson)."""
    for i, c in enumerate(s):
        if c in DIGIT and _at(s, i - 1) not in WORD:
            yield i


def has_date(s):
    for i in range(len(s) - 9):
        if (
            all(c in DIGIT for c in s[i:i + 4])
            and s[i + 4] == "-"
            and all(c in DIGIT for c in s[i + 5:i + 7])
            and s[i + 7] == "-"
            and all(c in DIGIT for c in s[i + 8:i + 10])
        ):
            return True
    return False


def has_percent(s):
    i = s.find("%")
    while i >= 0:
        j = i
        while j > 0 and s[j - 1] == " ":
            j -= 1
        if j > 0 and s[j - 1] in DIGIT:
            return True
        i = s.find("%", i + 1)
    return False


def has_num_unit(s):
    for i in _num_starts(s):
        k = _spaces(s, _digits(s, i))
        if k == _digits(s, i):
            continue
        for u in UNITS:
            if s.startswith(u, k) and _at(s, k + len(u)) not in WORD:
                return True
    return False


def has_num_of_num(s):
    for i in _num_starts(s):
        k = _spaces(s, _digits(s, i))
        if s.startswith("of ", k):
            k = _spaces(s, k + 2)
            if _at(s, k) in DIGIT:
                return True
    return False


def has_measured(s):
    low = s.lower()
    i = low.find("measured")
    while i >= 0:
        if _at(low, i - 1) not in WORD and _at(low, i + 8) not in WORD:
            for c in s[i + 8:i + 48]:
                if c == ".":
                    break
                if c in DIGIT:
                    return True
        i = low.find("measured", i + 1)
    return False


def has_counted_verdict(s):
    for v in VERDICTS:
        i = s.find(v)
        while i >= 0:
            if _at(s, i - 1) not in WORD and _at(s, i + len(v)) not in WORD:
                if _at(s, _spaces(s, i + len(v))) in DIGIT:
                    return True
            i = s.find(v, i + 1)
    for i in _num_starts(s):
        k = _spaces(s, _digits(s, i))
        for v in VERDICTS:
            if s.startswith(v, k) and _at(s, k + len(v)) not in WORD:
                return True
    return False


def states_measurement(s):
    """A line claiming a MEASUREMENT or a PREDICTION — a number with a unit, a
    date, a graded verdict beside a count, or `measured`/`byte-identical`."""
    return (
        has_date(s)
        or has_percent(s)
        or has_num_unit(s)
        or has_num_of_num(s)
        or has_measured(s)
        or "byte-identical" in s
        or ARROW in s
        or has_counted_verdict(s)
    )


def has_citation(s):
    """A GRADED HOME: an inventory row id, DECISIONS, or a `.md` doc."""
    if "DECISIONS" in s:
        return True
    i = s.find("D")
    while i >= 0:
        if _at(s, i - 1) not in WORD:
            j = i + 1
            while j < len(s) and s[j] in DIGIT:
                j += 1
            if 2 <= j - i - 1 <= 4 and _at(s, j) not in WORD:
                return True
        i = s.find("D", i + 1)
    i = s.find(".md")
    while i >= 0:
        if _at(s, i - 1) in WORD or _at(s, i - 1) == "-":
            return True
        i = s.find(".md", i + 1)
    return False


def blocks(src):
    """Maximal runs of consecutive lines whose first non-space token is `//`.
    A blank line, code, or a trailing comment's own line ends the run. Yields
    (first line number, [line text], is_header).

    THE MODULE HEADER is the FIRST such block with no code before it — blank lines
    and `import` declarations may precede it, and #2413's `format.vl` header (at
    line 4, under two imports) is why. It gets `HEADER_BUDGET`; every other block
    gets `BUDGET`. A `//` opening a line inside a multi-line template literal would
    be miscounted; the tree has none, and the lint carries the same bound."""
    cur, start = [], 0
    seen_code = header_taken = in_import = False
    for n, raw in enumerate(src.split("\n"), 1):
        ln = raw[:-1] if raw.endswith("\r") else raw
        t = ln.lstrip(" \t")
        if t.startswith("//"):
            if not cur:
                start = n
            cur.append(ln)
            continue
        if cur:
            is_header = not seen_code and not header_taken
            header_taken = header_taken or is_header
            yield start, cur, is_header
            cur = []
        if t == "":
            continue
        if in_import:
            in_import = "} from " not in t
        elif t.startswith("import "):
            in_import = " from " not in t
        else:
            seen_code = True
    if cur:
        yield start, cur, not seen_code and not header_taken


def grade(src):
    """(too-long hits, uncited-measurement hits) as (line, length) lists."""
    long_hits, uncited_hits = [], []
    for start, b, is_header in blocks(src):
        if len(b) > (HEADER_BUDGET if is_header else BUDGET):
            long_hits.append((start, len(b)))
        if any(states_measurement(x) for x in b) and not any(has_citation(x) for x in b):
            uncited_hits.append((start, len(b)))
    return long_hits, uncited_hits


def read_source(path):
    """Latin-1 so one index is one BYTE, matching the lint's `s[i]`."""
    with open(path, "rb") as fh:
        return fh.read().decode("latin-1")


def sources():
    for d in ("compiler", "std"):
        p = os.path.join(ROOT, d)
        for name in sorted(os.listdir(p)):
            if name.endswith(".vl"):
                yield f"{d}/{name}", os.path.join(p, name)


def current():
    out = {}
    for rel, path in sources():
        lo, un = grade(read_source(path))
        if lo or un:
            out[rel] = {TOO_LONG: len(lo), UNCITED: len(un)}
    return out


def load_baseline():
    with open(BASELINE, encoding="utf-8") as fh:
        return json.load(fh)


def write_baseline(cur):
    total = {c: sum(v[c] for v in cur.values()) for c in CODES}
    lines = [
        "{",
        f'"budget": {BUDGET},',
        f'"header_budget": {HEADER_BUDGET},',
        f'"total": {json.dumps(total)},',
        '"files": {',
    ]
    rows = [f'{json.dumps(k)}: {json.dumps(v)}' for k, v in sorted(cur.items())]
    lines.append(",\n".join(rows))
    lines += ["}", "}"]
    with open(BASELINE, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    print(f"wrote {BASELINE}: {total[TOO_LONG]} over budget, {total[UNCITED]} uncited")


def cmd_check(cur):
    base = load_baseline()["files"]
    bad = []
    for rel, v in sorted(cur.items()):
        b = base.get(rel, {})
        for c in CODES:
            if v[c] > b.get(c, 0):
                bad.append(f"  {rel}  {c}: {v[c]} (baseline {b.get(c, 0)})")
    if bad:
        print("comment budget REGRESSED — a file may only go down or stay:")
        print("\n".join(bad))
        print(
            "\nShorten the block (state the invariant + the why + the row id) or cite\n"
            "the row the number lives in. After a real trim, lower the baseline with\n"
            "  python3 scripts/comment-budget.py --write-baseline"
        )
        return 1
    tot = {c: sum(v[c] for v in cur.values()) for c in CODES}
    print(f"comment budget ok — {tot[TOO_LONG]} over budget, {tot[UNCITED]} uncited (baseline or below)")
    return 0


def cmd_exempt_codes():
    """Codes scripts/lint-self.sh still tolerates: exactly those the committed
    baseline still owes. At zero the code prints nothing and the gate bites."""
    total = load_baseline()["total"]
    print(" ".join(c for c in CODES if total.get(c, 0) > 0))
    return 0


def cmd_filter_lint(path, extra=()):
    """Grade a `vl check --json` diagnostic dump against that allow-list.

    `extra` names codes a SIBLING ratchet still owes — scripts/scan-budget.py
    prints its own through `--exempt-codes`, and lint-self.sh passes them here so
    one filter grades the whole dump rather than two chained ones."""
    total = load_baseline()["total"]
    exempt = {c for c in CODES if total.get(c, 0) > 0} | set(extra)
    with open(path, encoding="utf-8") as fh:
        text = fh.read().strip()
    diags = json.loads(text) if text else []
    kept = [d for d in diags if d.get("code") not in exempt]
    for d in kept:
        print(f"{d['file']}:{d['line']}:{d['col']}: {d['severity']} [{d.get('code', '')}] {d['message']}")
    held = len(diags) - len(kept)
    if held:
        print(f"({held} finding(s) held by the comment-budget ratchet: {' '.join(sorted(exempt))})")
    return 1 if kept else 0


def cmd_grade(path):
    """One file's hits as JSON — the shape tests/vl_comment_budget_test.ts
    compares against the lint's own diagnostics."""
    lo, un = grade(read_source(path))
    print(json.dumps({TOO_LONG: lo, UNCITED: un}))
    return 0


def cmd_list(cur, code):
    for rel, path in sources():
        if rel not in cur:
            continue
        lo, un = grade(read_source(path))
        for start, n in (lo if code == TOO_LONG else un):
            print(f"{rel}:{start}  ({n} lines)")
    return 0


def main():
    args = sys.argv[1:]
    if "--exempt-codes" in args:
        return cmd_exempt_codes()
    if "--filter-lint" in args:
        i = args.index("--filter-lint")
        return cmd_filter_lint(args[i + 1], args[i + 2:])
    if "--grade" in args:
        return cmd_grade(args[args.index("--grade") + 1])
    cur = current()
    if "--write-baseline" in args:
        write_baseline(cur)
        return 0
    if "--check" in args:
        return cmd_check(cur)
    if "--list" in args:
        return cmd_list(cur, args[args.index("--list") + 1])
    tot = {c: sum(v[c] for v in cur.values()) for c in CODES}
    print(f"{'file':<32}{TOO_LONG:>26}{UNCITED:>30}")
    for rel, v in sorted(cur.items(), key=lambda kv: -kv[1][TOO_LONG]):
        print(f"{rel:<32}{v[TOO_LONG]:>26}{v[UNCITED]:>30}")
    print(f"{'TOTAL':<32}{tot[TOO_LONG]:>26}{tot[UNCITED]:>30}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
