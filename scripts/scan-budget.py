#!/usr/bin/env python3
"""The arena-scan ratchet — the tree-wide half of `arena-scan-outside-pass`.

Same rule as compiler/lint.vl's, over the same six whole-program tables and the
same pass / allow lists, which are READ FROM that file so the two cannot drift.
Per-file counts may only FALL: `--check` fails when a file exceeds its baseline,
`--write-baseline` lowers it after a scan is banked. Sibling of
scripts/comment-budget.py; see CLAUDE.md, "A COST REGRESSION SHOWS UP ONE
BOOTSTRAP STEP LATE".

Why a ratchet and not a gate at zero: 132 of these stand today (2026-09-03), and
every one is a loop somebody has to READ before deciding whether the answer can be
banked, memoised on an arena prefix, or is genuinely once per program. The number
that matters is that it never goes up.
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE = os.path.join(ROOT, "scripts", "scan-budget-baseline.json")
LINT = os.path.join(ROOT, "compiler", "lint.vl")
SECTIONS = os.path.join(ROOT, "compiler", "emit_sections.vl")
CODE = "arena-scan-outside-pass"

WORD = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_")
DIGIT = set("0123456789")


def read_source(path):
    """Latin-1 so one index is one BYTE, matching the lint's `s[i]`."""
    with open(path, "rb") as fh:
        return fh.read().decode("latin-1")


def vl_list(src, name):
    """The string entries of `const <name> = [ … ]` in a VL source, in order.

    Entries carry a trailing `// reason` comment in `asAllow`; only the quoted
    names are read, so the reasons stay free text."""
    m = re.search(r'^const ' + re.escape(name) + r' = \[\n(.*?)^\]$', src, re.M | re.S)
    if not m:
        raise SystemExit(f"scan-budget: compiler/lint.vl has no `const {name} = [`")
    return re.findall(r'"([^"]*)"', m.group(1))


def emit_pass_names():
    """The pass names `runEmitPass` dispatches — the emitter's own list."""
    src = read_source(SECTIONS)
    i = src.index("function runEmitPass(")
    body = src[i:src.index("\n}\n", i)]
    return {m.group(1) for m in re.finditer(r'return\s+([A-Za-z0-9_]+)\(', body)}


def _word_at(s, i, b):
    return 0 <= i < b and s[i] in WORD


def _at(s, i, b, w):
    return i >= 0 and i + len(w) <= b and s.startswith(w, i)


def _spaces_end(s, i, b):
    while i < b and s[i] == " ":
        i += 1
    return i


def _ident_at(s, i, b):
    if not _word_at(s, i, b) or s[i] in DIGIT:
        return ""
    j = i
    while _word_at(s, j, b):
        j += 1
    return s[i:j]


def _table_at(s, i, b, tables):
    for nm in tables:
        if _at(s, i, b, nm) and _at(s, i + len(nm), b, ".length"):
            return nm
    return ""


def _while_var(s, k, b, tables):
    if not _at(s, k, b, "while "):
        return ""
    v = _ident_at(s, k + 6, b)
    if not v:
        return ""
    p = _spaces_end(s, k + 6 + len(v), b)
    if p >= b or s[p] != "<":
        return ""
    p = _spaces_end(s, p + 1, b)
    return v if _table_at(s, p, b, tables) else ""


def _fn_name(s, k, b):
    p = k
    if _at(s, p, b, "export "):
        p = _spaces_end(s, p + 7, b)
    if not _at(s, p, b, "function "):
        return ""
    return _ident_at(s, _spaces_end(s, p + 9, b), b)


def _zeroed_name(s, k, b):
    p = k
    if _at(s, p, b, "let "):
        p += 4
    elif _at(s, p, b, "const "):
        p += 6
    else:
        return ""
    p = _spaces_end(s, p, b)
    v = _ident_at(s, p, b)
    if not v:
        return ""
    p = _spaces_end(s, p + len(v), b)
    if p >= b or s[p] != "=":
        return ""
    p = _spaces_end(s, p + 1, b)
    if p >= b or s[p] != "0" or p + 1 != b:
        return ""
    return v


def grade(src, tables, ok):
    """(line, function) of every reported scan — the lint's own walk, line by line."""
    hits, fn_name, zeroed = [], "", []
    for line, raw in enumerate(src.split("\n"), 1):
        ln = raw[:-1] if raw.endswith("\r") else raw
        b = len(ln)
        k = 0
        while k < b and ln[k] in " \t":
            k += 1
        fn = _fn_name(ln, k, b)
        if fn:
            fn_name, zeroed = fn, []
            continue
        z = _zeroed_name(ln, k, b)
        if z:
            zeroed.append(z)
            continue
        v = _while_var(ln, k, b, tables)
        if v and v in zeroed and fn_name not in ok:
            hits.append((line, fn_name))
    return hits


def sources():
    for d in ("compiler", "std"):
        p = os.path.join(ROOT, d)
        for name in sorted(os.listdir(p)):
            if name.endswith(".vl"):
                yield f"{d}/{name}", os.path.join(p, name)


def current():
    lint = read_source(LINT)
    tables = vl_list(lint, "asTables")
    passes = vl_list(lint, "asPasses")
    allow = vl_list(lint, "asAllow")
    # The lint's copy of the pass table must still BE the pass table. `checkProgram` is
    # the checker's entry and has no row in `runEmitPass`, so it is the one addition.
    missing = emit_pass_names() - set(passes)
    if missing:
        raise SystemExit(
            "scan-budget: compiler/lint.vl's `asPasses` is missing pass(es) that "
            f"`runEmitPass` dispatches: {' '.join(sorted(missing))}"
        )
    ok = set(passes) | set(allow)
    out = {}
    for rel, path in sources():
        hits = grade(read_source(path), tables, ok)
        if hits:
            out[rel] = {CODE: len(hits)}
    return out


def load_baseline():
    with open(BASELINE, encoding="utf-8") as fh:
        return json.load(fh)


def write_baseline(cur):
    total = sum(v[CODE] for v in cur.values())
    rows = [f'{json.dumps(k)}: {json.dumps(v)}' for k, v in sorted(cur.items())]
    body = "\n".join([
        "{",
        f'"total": {json.dumps({CODE: total})},',
        '"files": {',
        ",\n".join(rows),
        "}",
        "}",
    ])
    with open(BASELINE, "w", encoding="utf-8") as fh:
        fh.write(body + "\n")
    print(f"wrote {BASELINE}: {total} scans outside a pass")


def cmd_check(cur):
    base = load_baseline()["files"]
    bad = []
    for rel, v in sorted(cur.items()):
        was = base.get(rel, {}).get(CODE, 0)
        if v[CODE] > was:
            bad.append(f"  {rel}  {CODE}: {v[CODE]} (baseline {was})")
    if bad:
        print("arena-scan budget REGRESSED — a file may only go down or stay:")
        print("\n".join(bad))
        print(
            "\nA loop bounded by a whole-program table belongs in a pass, or banks its\n"
            "answer on an arena prefix the way `moduleHasUnionAs` does (#2419). After a\n"
            "real fix, lower the baseline with\n"
            "  python3 scripts/scan-budget.py --write-baseline"
        )
        return 1
    print(f"arena-scan budget ok — {sum(v[CODE] for v in cur.values())} scans outside a "
          "pass (baseline or below)")
    return 0


def cmd_exempt_codes():
    """Whether scripts/lint-self.sh still tolerates the code: it does exactly while
    the committed baseline still owes it. At zero this prints nothing and the gate bites."""
    if load_baseline()["total"].get(CODE, 0) > 0:
        print(CODE)
    return 0


def cmd_list(cur, limit):
    lint = read_source(LINT)
    tables, ok = vl_list(lint, "asTables"), set(vl_list(lint, "asPasses")) | set(vl_list(lint, "asAllow"))
    n = 0
    for rel, path in sources():
        if rel not in cur:
            continue
        for line, fn in grade(read_source(path), tables, ok):
            print(f"{rel}:{line}  {fn}")
            n += 1
            if limit and n >= limit:
                return 0
    return 0


def main():
    args = sys.argv[1:]
    if "--exempt-codes" in args:
        return cmd_exempt_codes()
    cur = current()
    if "--write-baseline" in args:
        write_baseline(cur)
        return 0
    if "--check" in args:
        return cmd_check(cur)
    if "--list" in args:
        i = args.index("--list")
        return cmd_list(cur, int(args[i + 1]) if len(args) > i + 1 else 0)
    total = sum(v[CODE] for v in cur.values())
    print(f"{'file':<32}{CODE:>26}")
    for rel, v in sorted(cur.items(), key=lambda kv: -kv[1][CODE]):
        print(f"{rel:<32}{v[CODE]:>26}")
    print(f"{'TOTAL':<32}{total:>26}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
