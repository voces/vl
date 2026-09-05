#!/usr/bin/env python3
"""The sentinel-index ratchet — the tree-wide half of `sentinel-index-unguarded` and
`sentinel-index-strict-untested`.

Same rule as compiler/lint.vl's, over the same per-module derivations, and the two are
compared position for position by tests/vl_sentinel_index_test.ts. Per-file counts may
only FALL: `--check` fails when a file exceeds its baseline, `--write-baseline` lowers it
after a read is guarded. The baseline schema, the `--check`/`--why` commands and the exit
codes are scripts/ratchet.py, shared with the other four ratchets; see CLAUDE.md and
docs/internals/sentinel-index-lint.md.

Why a ratchet and not a gate at zero: most of the standing hits are a reader handed an
arena index its caller already knows is real. What the rule buys is that a NEW table read
has to say why its index is in range, and that the number never goes up — the four traps
of 2026-09-03 were each one line that did not.

BOTH CODES GATE. `sentinel-index-strict-untested` is the weaker finding (a `*Strict`
reader's -1 is its documented answer, not a clamp that happens to be in range) and its
baseline is ZERO, which is the only reason gating it costs nothing: at zero the ratchet
says "do not start", which is what a weak finding with no backlog should say.

The analysis itself lives in scripts/sentinel-census.py — one implementation, two front
ends, so the census a reader runs and the number the gate reads cannot disagree.
"""

import importlib.util
import json
import os
import sys

import ratchet

BASELINE = os.path.join(ratchet.ROOT, "scripts", "sentinel-budget-baseline.json")
UNGUARDED = "sentinel-index-unguarded"
STRICT = "sentinel-index-strict-untested"
CODES = (UNGUARDED, STRICT)

_CENSUS = None


def census():
    """scripts/sentinel-census.py as a module. Its name carries a dash, so it is loaded
    by path rather than imported — the alternative is a second copy of the walk, which is
    exactly what this file exists to prevent. Memoised: `--why` walks two trees through
    the same module."""
    global _CENSUS
    if _CENSUS is None:
        path = os.path.join(ratchet.ROOT, "scripts", "sentinel-census.py")
        spec = importlib.util.spec_from_file_location("sentinel_census", path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _CENSUS = mod
    return _CENSUS


def current(sc):
    """{file: {code: count}} — the lint's own hits, per file."""
    out = {}
    for h in sc.all_hits():
        out.setdefault(h.rel, {}).setdefault(h.code, 0)
        out[h.rel][h.code] += 1
    for v in out.values():
        for c in CODES:
            v.setdefault(c, 0)
    return out


def named(root):
    """{code: {name: hits}} for one tree — the NAMED entries, `file:function`.

    HITS PER NAME, not a bare set: one function commonly carries several of these (a
    different table each), so a name that keeps its place while its count falls is a
    function that guarded one of two, which a set would show as no movement at all."""
    sc = census()
    saved, sc.ROOT = sc.ROOT, root
    try:
        out = {c: {} for c in CODES}
        for h in sc.all_hits():
            k = h.key()
            out[h.code][k] = out[h.code].get(k, 0) + 1
        return out
    finally:
        sc.ROOT = saved


R = ratchet.Ratchet(
    script="sentinel-budget.py",
    label="sentinel-index",
    baseline=BASELINE,
    codes=CODES,
    ok_line=lambda t: f"sentinel-index budget ok — {t[UNGUARDED]} unguarded reads, "
                      f"{t[STRICT]} untested strict reads (baseline or below)",
    remedy="A table read whose index came from a reader that can answer in band must\n"
           "be bound-tested — `if i < 0 || i >= tbl.length { … }` — or must take a\n"
           "reader whose miss cannot be a real row. `vl check` returns 0 either way;\n"
           "the difference is whether the COMPILER traps (D1440, D1462, D1500, #2498).\n"
           "After a real fix, lower the baseline with",
    wrote_line=lambda t: f"{t[UNGUARDED]} unguarded reads, "
                         f"{t[STRICT]} untested strict reads",
    extras=lambda: (("commit", ratchet.head_commit()),),
    named=named,
)


def cmd_grade(sc, path):
    """ONE file's hits as JSON — the shape tests/vl_sentinel_index_test.ts compares
    against the lint's own diagnostics. Grades the file WHERE IT IS, so a fixture in a
    temp directory reads exactly as a compiler module does."""
    rel = os.path.basename(path)
    out = {c: [] for c in CODES}
    for h in sc.hits_in(rel, sc.read_source(path)):
        out[h.code].append([h.line, h.col, h.table, h.idx])
    for c in CODES:
        out[c].sort()
    print(json.dumps(out))
    return 0


def cmd_list(sc, code, limit):
    n = 0
    for h in sc.all_hits():
        if code and h.code != code:
            continue
        print(f"{h.rel}:{h.line}  {h.fn}  {h.table}[{h.idx}]  <- {h.producer}")
        n += 1
        if limit and n >= limit:
            return 0
    return 0


def main():
    args = sys.argv[1:]
    if "--exempt-codes" in args:
        return R.exempt_codes()
    sc = census()
    if "--why" in args:
        return R.why(ratchet.flag_value(args, "--why"))
    if "--grade" in args:
        return cmd_grade(sc, args[args.index("--grade") + 1])
    if "--list" in args:
        i = args.index("--list")
        code = args[i + 1] if len(args) > i + 1 else UNGUARDED
        return cmd_list(sc, code, int(args[i + 2]) if len(args) > i + 2 else 0)
    cur = current(sc)
    if "--write-baseline" in args:
        return R.write_baseline(cur)
    if "--check" in args:
        return R.check(cur)
    tot = R.totals(cur)
    print(f"{'file':<32}{UNGUARDED:>28}{STRICT:>34}")
    for rel, v in sorted(cur.items(), key=lambda kv: -kv[1][UNGUARDED]):
        print(f"{rel:<32}{v[UNGUARDED]:>28}{v[STRICT]:>34}")
    print(f"{'TOTAL':<32}{tot[UNGUARDED]:>28}{tot[STRICT]:>34}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
