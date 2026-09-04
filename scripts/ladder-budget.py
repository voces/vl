#!/usr/bin/env python3
"""The kind-ladder ratchet — the tree-wide half of `kind-ladder-incomplete` and
`kind-ladder-split`.

Same rule as compiler/lint.vl's, over the same closed sets and the same two-arm
floor, and the sets are READ FROM BOTH SIDES and compared, so the lint's copy of
`VKind` cannot drift from the `export type` that declares it. Per-file counts may
only FALL: `--check` fails when a file exceeds its baseline, `--write-baseline`
lowers it after a ladder is closed. Sibling of scripts/comment-budget.py and
scripts/scan-budget.py; see CLAUDE.md, "A LADDER OVER A CLOSED KIND SET".

Why a ratchet and not a gate at zero: most of these are a resolver that
legitimately answers about three of thirty-seven node kinds. What the rule buys
is that a NEW one has to say what it excludes, and that the number never goes up.

WHY THE FLOOR IS TWO ARMS, AND WHAT RAISING IT WOULD DROP. D1370's ladder —
`captureValKind`, `Param` and `LetDecl` and a silent `"i32"` for a module-BLOCK
capture — has EXACTLY TWO ARMS, so a floor of three cannot see it and the row
that motivated this rule would go unreported. A floor of one reports the
`const n = P.nodes[ix]; if n is X { … }` guard idiom, which is not a dispatch at
all. The baseline carries the same sentence in `why_min_arms`, beside the number
it explains; raise the floor only knowingly, and re-read D1370 first.

The analysis itself lives in scripts/ladder-census.py — one implementation, two
front ends, so the census a reader runs and the number the gate reads cannot
disagree.
"""

import importlib.util
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE = os.path.join(ROOT, "scripts", "ladder-budget-baseline.json")
LINT = os.path.join(ROOT, "compiler", "lint.vl")
INCOMPLETE = "kind-ladder-incomplete"
SPLIT = "kind-ladder-split"
CODES = (INCOMPLETE, SPLIT)
# Committed INTO the baseline beside `min_arms`, so a future tidy-up raising the floor
# reads the row it would drop in the very file it is editing.
WHY_MIN_ARMS = (
    "D1370's ladder (captureValKind: Param, LetDecl, and a silent \"i32\" for a "
    "module-block capture) has EXACTLY TWO ARMS, so a floor of 3 cannot see it. A "
    "floor of 1 reports the `if n is X` guard idiom, which is not a dispatch. Raise "
    "the floor only knowingly, and re-read D1370 first."
)


def census():
    """scripts/ladder-census.py as a module. Its name carries a dash, so it is
    loaded by path rather than imported — the alternative is a second copy of the
    walk, which is exactly what this file exists to prevent."""
    path = os.path.join(ROOT, "scripts", "ladder-census.py")
    spec = importlib.util.spec_from_file_location("ladder_census", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def lint_sets(src):
    """The closed sets as compiler/lint.vl carries them: `const kl<Name> = [ … ]`
    for every name in `klSetNames`, in that order."""
    m = re.search(r"^const klSetNames = \[(.*?)\]$", src, re.M | re.S)
    if not m:
        raise SystemExit("ladder-budget: compiler/lint.vl has no `const klSetNames = [`")
    names = re.findall(r'"([^"]*)"', m.group(1))
    out = {}
    for name in names:
        d = re.search(r"^const kl" + re.escape(name) + r" = \[(.*?)\]$", src, re.M | re.S)
        if not d:
            raise SystemExit(f"ladder-budget: compiler/lint.vl has no `const kl{name} = [`")
        out[name] = re.findall(r'"([^"]*)"', d.group(1))
    return out


def check_sets(lc):
    """The lint's copy must still BE the tree's declaration — same sets, same
    members, same ORDER (the member order is the union's box-tag order, and the
    lint reports `n of m` against it)."""
    tree = lc.closed_sets()
    mine = lint_sets(lc.read_source(LINT))
    bad = []
    for name, members in sorted(mine.items()):
        if name not in tree:
            bad.append(f"  `{name}` is in compiler/lint.vl and no longer declared in the tree")
        elif tree[name][0] != members:
            bad.append(f"  `{name}` differs: tree {tree[name][0]}\n            lint {members}")
    for name in sorted(tree):
        if name not in mine:
            bad.append(f"  `{name}` ({tree[name][2]}) is declared in the tree and missing "
                       "from compiler/lint.vl's `klSetNames`")
    if bad:
        raise SystemExit(
            "ladder-budget: compiler/lint.vl's closed-set copy has drifted from the "
            "`export type` declarations it mirrors:\n" + "\n".join(bad))


def current(lc):
    """{file: {code: count}} — the lint's own hits, per file."""
    sets = lc.closed_sets()
    idx = lc.member_index(sets)
    out = {}
    for lad in lc.all_ladders(sets, idx):
        if lad.ending == "silent":
            out.setdefault(lad.rel, {}).setdefault(INCOMPLETE, 0)
            out[lad.rel][INCOMPLETE] += 1
    for rel, _sn, x, _y, _gap, _shared, _ow in lc.split_pairs(sets, idx):
        out.setdefault(rel, {}).setdefault(SPLIT, 0)
        out[rel][SPLIT] += 1
    for v in out.values():
        for c in CODES:
            v.setdefault(c, 0)
    return out


def load_baseline():
    with open(BASELINE, encoding="utf-8") as fh:
        return json.load(fh)


def write_baseline(cur):
    total = {c: sum(v[c] for v in cur.values()) for c in CODES}
    rows = [f'{json.dumps(k)}: {json.dumps(v)}' for k, v in sorted(cur.items())]
    body = "\n".join([
        "{",
        f'"min_arms": {census().MIN_ARMS},',
        f'"why_min_arms": {json.dumps(WHY_MIN_ARMS)},',
        f'"total": {json.dumps(total)},',
        '"files": {',
        ",\n".join(rows),
        "}",
        "}",
    ])
    with open(BASELINE, "w", encoding="utf-8") as fh:
        fh.write(body + "\n")
    print(f"wrote {BASELINE}: {total[INCOMPLETE]} silent ladders, "
          f"{total[SPLIT]} split walks")


def cmd_check(cur):
    base = load_baseline()["files"]
    bad = []
    for rel, v in sorted(cur.items()):
        b = base.get(rel, {})
        for c in CODES:
            if v[c] > b.get(c, 0):
                bad.append(f"  {rel}  {c}: {v[c]} (baseline {b.get(c, 0)})")
    if bad:
        print("kind-ladder budget REGRESSED — a file may only go down or stay:")
        print("\n".join(bad))
        print(
            "\nA ladder over a closed kind set is exhaustive over it, or ends in a\n"
            "default that NAMES what it excludes — an `emitFail`, a sentence, or a\n"
            "delegation to the ladder that owns the rest. After a real fix, lower the\n"
            "baseline with\n"
            "  python3 scripts/ladder-budget.py --write-baseline"
        )
        return 1
    tot = {c: sum(v[c] for v in cur.values()) for c in CODES}
    print(f"kind-ladder budget ok — {tot[INCOMPLETE]} silent ladders, {tot[SPLIT]} "
          "split walks (baseline or below)")
    return 0


def cmd_exempt_codes():
    """The codes scripts/lint-self.sh still tolerates: exactly those the committed
    baseline still owes. At zero this prints nothing and the gate bites."""
    total = load_baseline()["total"]
    print(" ".join(c for c in CODES if total.get(c, 0) > 0))
    return 0


def cmd_grade(lc, path):
    """ONE file's hits as JSON — the shape tests/vl_kind_ladder_test.ts compares
    against the lint's own diagnostics. Grades the file WHERE IT IS, so a fixture in
    a temp directory reads exactly as a compiler module does."""
    rel = os.path.basename(path)
    src = lc.read_source(path)
    sets = lc.closed_sets()
    idx = lc.member_index(sets)
    lads = [(l.first + 1, l.fn) for l in lc.ladders_of(rel, src, sets, idx)
            if l.ending == "silent"]
    spl = [(x.first + 1, x.fn, y.fn) for _r, _sn, x, y, _g, _s, _o
           in lc.split_in(rel, src, sets, idx)]
    print(json.dumps({INCOMPLETE: sorted(lads), SPLIT: sorted(spl)}))
    return 0


def cmd_list(lc, code, limit):
    sets = lc.closed_sets()
    idx = lc.member_index(sets)
    n = 0
    if code == SPLIT:
        for rel, sn, x, y, _g, _s, ow in lc.split_pairs(sets, idx):
            print(f"{rel}:{x.first + 1}  {x.fn} -> {y.fn}  {sn}  drops {len(ow)}")
            n += 1
            if limit and n >= limit:
                return 0
        return 0
    for l in sorted(lc.all_ladders(sets, idx), key=lambda l: (l.rel, l.first)):
        if l.ending != "silent":
            continue
        print(f"{l.rel}:{l.first + 1}  {l.fn}  {l.set}  "
              f"{len(l.arms)}/{len(sets[l.set][0])}")
        n += 1
        if limit and n >= limit:
            return 0
    return 0


def main():
    args = sys.argv[1:]
    if "--exempt-codes" in args:
        return cmd_exempt_codes()
    lc = census()
    check_sets(lc)
    if "--grade" in args:
        return cmd_grade(lc, args[args.index("--grade") + 1])
    if "--list" in args:
        i = args.index("--list")
        code = args[i + 1] if len(args) > i + 1 else INCOMPLETE
        return cmd_list(lc, code, int(args[i + 2]) if len(args) > i + 2 else 0)
    cur = current(lc)
    if "--write-baseline" in args:
        write_baseline(cur)
        return 0
    if "--check" in args:
        return cmd_check(cur)
    tot = {c: sum(v[c] for v in cur.values()) for c in CODES}
    print(f"{'file':<32}{INCOMPLETE:>26}{SPLIT:>20}")
    for rel, v in sorted(cur.items(), key=lambda kv: -kv[1][INCOMPLETE]):
        print(f"{rel:<32}{v[INCOMPLETE]:>26}{v[SPLIT]:>20}")
    print(f"{'TOTAL':<32}{tot[INCOMPLETE]:>26}{tot[SPLIT]:>20}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
