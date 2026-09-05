#!/usr/bin/env python3
"""The comment-budget ratchet — the tree-wide half of the four comment rules.

Same four clauses as compiler/lint.vl's rules, over the same block definition and
the same two budgets — 4 lines a block, 12 a module header — so the numbers agree
file by file (tests/vl_comment_budget_test.ts pins that).
Per-file counts may only FALL: `--check` fails when any file exceeds its
baseline, `--write-baseline` lowers it after a trim lands. The baseline schema,
the `--check`/`--why` commands and the exit codes are scripts/ratchet.py, shared
with the other four ratchets. The rules themselves are
docs/internals/comment-style.md.
"""

import json
import os
import sys

import ratchet
from ratchet import DIGIT, WORD, read_source

BUDGET = 4
# A module header earns more room: it is the file's contract, not a note beside one
# line. Both implementations read both budgets from here.
HEADER_BUDGET = 12
BASELINE = os.path.join(ratchet.ROOT, "scripts", "comment-budget-baseline.json")
TOO_LONG = "comment-block-too-long"
UNCITED = "comment-measurement-uncited"
SHOUTING = "comment-shouting"
HISTORY = "comment-history"
CODES = (TOO_LONG, UNCITED, SHOUTING, HISTORY)
# `std/` is deliberately absent — see `sources()`.
TREES = ("compiler",)

# The acronyms a comment may spell in capitals (rule 5) — the whole allow-list, in
# one place. A word under three letters never reaches it, so `GC` needs no entry.
ACRONYMS = frozenset(
    "ABI API ASCII AST CLI IEEE JSON LEB LSP OOB RFC UFCS UTF WASM".split()
)
# Rule 3's phrases, longest first so `no longer` is not read as two words.
HISTORY_PHRASES = ("no longer", "used to", "previously", "measured", "landed", "was", "were")
HISTORY_STARTS = frozenset("nNuUpPmMlLwW")

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


def _iat(s, i, b, w):
    """`w`, given lower-case, at `i` with the SOURCE side's case folded — the
    ratchet's copy of `cbAtI`."""
    if i < 0 or i + len(w) > b:
        return False
    for k, ch in enumerate(w):
        c = s[i + k]
        if "A" <= c <= "Z":
            c = chr(ord(c) + 32)
        if c != ch:
            return False
    return True


def _word_at(s, i, b):
    return 0 <= i < b and s[i] in WORD


def _date_at(s, i, b):
    """`yyyy-mm-dd` at `i` — the ratchet's copy of `cbDateAt`."""
    if i + 10 > b:
        return False
    for k in range(10):
        c = s[i + k]
        if k == 4 or k == 7:
            if c != "-":
                return False
        elif c not in DIGIT:
            return False
    return True


def is_shout_word(s, i, e):
    """`s[i, e)` is three or more letters, every one a capital, and not an acronym."""
    if e - i < 3:
        return False
    for k in range(i, e):
        if not ("A" <= s[k] <= "Z"):
            return False
    return s[i:e] not in ACRONYMS


def shouts(line):
    """Whether the comment line has two shout words in a row (rule 5).

    A backtick TOGGLES an in-ticks state, per line, starting outside: a backticked
    span is skipped rather than treated as a break, and an unpaired backtick hides
    the rest of its line. compiler/lint.vl's `cbShoutLine` scans identically."""
    b = len(line)
    i, tick, prev = 0, False, False
    while i < b:
        c = line[i]
        if c == "`":
            tick = not tick
            i += 1
        elif c in WORD:
            e = i
            while e < b and line[e] in WORD:
                e += 1
            if not tick:
                sh = is_shout_word(line, i, e)
                if sh and prev:
                    return True
                prev = sh
            i = e
        else:
            i += 1
    return False


def hist_phrase(line):
    """The first history phrase the comment line carries, or "" (rule 3). A date is
    history with no verb. Same in-ticks scan as `shouts`."""
    b = len(line)
    i, tick = 0, False
    while i < b:
        c = line[i]
        if c == "`":
            tick = not tick
        elif not tick:
            if c in DIGIT:
                if _date_at(line, i, b):
                    return "a date"
            elif c in HISTORY_STARTS and not _word_at(line, i - 1, b):
                for w in HISTORY_PHRASES:
                    if _iat(line, i, b, w) and not _word_at(line, i + len(w), b):
                        return w
        i += 1
    return ""


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


def _first(b, pred):
    """The 0-based offset of the first line of `b` satisfying `pred`, or -1."""
    for k, ln in enumerate(b):
        if pred(ln):
            return k
    return -1


def block_hits(start, b, is_header):
    """ONE block's hits per code, each of (line, block length).

    Length and the uncited measurement are BLOCK facts and report at the block's
    first line; shouting and history are LINE facts and report where they stand,
    once per block per code — the same positions compiler/lint.vl emits."""
    hits = {c: [] for c in CODES}
    if len(b) > (HEADER_BUDGET if is_header else BUDGET):
        hits[TOO_LONG].append((start, len(b)))
    if any(states_measurement(x) for x in b) and not any(has_citation(x) for x in b):
        hits[UNCITED].append((start, len(b)))
    k = _first(b, shouts)
    if k >= 0:
        hits[SHOUTING].append((start + k, len(b)))
    k = _first(b, hist_phrase)
    if k >= 0:
        hits[HISTORY].append((start + k, len(b)))
    return hits


def grade(src):
    """One hit list per code for a whole source, in block order."""
    hits = {c: [] for c in CODES}
    for start, b, is_header in blocks(src):
        for c, hs in block_hits(start, b, is_header).items():
            hits[c] += hs
    return hits


def sources(root=None):
    """The tree this ratchet owns: `compiler/` only.

    `std/` is deliberately absent. comment-style.md is the COMPILER's rubric; a
    std comment is consumer API surface and is graded by `std-comment-audience`
    against std-api-review.md §4, which has no baseline. compiler/lint.vl skips
    the four codes for a std module for the same reason (D1601), so walking std
    here would ratchet a count the lint no longer produces.
    """
    return ratchet.sources(TREES, root)


def current():
    out = {}
    for rel, path in sources():
        hits = grade(read_source(path))
        if any(hits[c] for c in CODES):
            out[rel] = {c: len(hits[c]) for c in CODES}
    return out


def named(root):
    """{code: {name: hits}} for one tree — the NAMED entries,
    `file:<the block's opening line>`.

    A comment block has no function to be named after, and its LINE NUMBER moves
    whenever anything above it does, so the name is its opening text trimmed to 60
    characters. Two blocks in one file that open identically collapse into one name
    with a count, which is what hits-per-name is for."""
    out = {c: {} for c in CODES}
    for rel, path in sources(root):
        for start, b, is_header in blocks(read_source(path)):
            key = f"{rel}:{b[0].strip()[:60]}"
            for c, hs in block_hits(start, b, is_header).items():
                if hs:
                    out[c][key] = out[c].get(key, 0) + len(hs)
    return out


R = ratchet.Ratchet(
    script="comment-budget.py",
    label="comment",
    baseline=BASELINE,
    codes=CODES,
    ok_line=lambda t: "comment budget ok (baseline or below) — "
                      + ", ".join(f"{t[c]} {c}" for c in CODES),
    remedy="Shorten the block (state the invariant + the why + the row id) or cite\n"
           "the row the number lives in. After a real trim, lower the baseline with",
    wrote_line=lambda t: ", ".join(f"{t[c]} {c}" for c in CODES),
    extras=lambda: (("budget", BUDGET), ("header_budget", HEADER_BUDGET),
                    ("commit", ratchet.head_commit())),
    named=named,
    tree_paths=TREES,
)


def cmd_filter_lint(path, extra=()):
    """Grade a `vl check --json` diagnostic dump against that allow-list.

    `extra` names codes a SIBLING ratchet still owes — scripts/scan-budget.py
    prints its own through `--exempt-codes`, and lint-self.sh passes them here so
    one filter grades the whole dump rather than two chained ones."""
    total = R.load_baseline()["total"]
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
    compares against the lint's own diagnostics.

    Path-blind on purpose: it grades the text it is handed. Which trees the four
    codes APPLY to is `sources()` here and the module-path test in
    compiler/lint.vl, and the test pins that pair separately."""
    print(json.dumps(grade(read_source(path))))
    return 0


def cmd_list(cur, code):
    if code not in CODES:
        raise SystemExit(f"{R.stem}: --list wants one of {' '.join(CODES)}")
    for rel, path in sources():
        if rel not in cur:
            continue
        for start, n in grade(read_source(path))[code]:
            print(f"{rel}:{start}  ({n} lines)")
    return 0


def main():
    args = sys.argv[1:]
    if "--exempt-codes" in args:
        return R.exempt_codes()
    if "--why" in args:
        return R.why(ratchet.flag_value(args, "--why"))
    if "--filter-lint" in args:
        i = args.index("--filter-lint")
        return cmd_filter_lint(args[i + 1], args[i + 2:])
    if "--grade" in args:
        return cmd_grade(args[args.index("--grade") + 1])
    cur = current()
    if "--write-baseline" in args:
        return R.write_baseline(cur)
    if "--check" in args:
        return R.check(cur)
    if "--list" in args:
        return cmd_list(cur, args[args.index("--list") + 1])
    tot = R.totals(cur)
    head = "".join(f"{c.removeprefix('comment-'):>14}" for c in CODES)
    print(f"{'file':<28}{head}")
    for rel, v in sorted(cur.items(), key=lambda kv: -sum(kv[1].values())):
        print(f"{rel:<28}" + "".join(f"{v[c]:>14}" for c in CODES))
    print(f"{'TOTAL':<28}" + "".join(f"{tot[c]:>14}" for c in CODES))
    return 0


if __name__ == "__main__":
    sys.exit(main())
