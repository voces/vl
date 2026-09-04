#!/usr/bin/env python3
"""The sentinel-index ratchet — the tree-wide half of `sentinel-index-unguarded` and
`sentinel-index-strict-untested`.

Same rule as compiler/lint.vl's, over the same per-module derivations, and the two are
compared position for position by tests/vl_sentinel_index_test.ts. Per-file counts may
only FALL: `--check` fails when a file exceeds its baseline, `--write-baseline` lowers it
after a read is guarded. Sibling of scripts/comment-budget.py, scripts/scan-budget.py and
scripts/ladder-budget.py; see CLAUDE.md and docs/internals/sentinel-index-lint.md.

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
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE = os.path.join(ROOT, "scripts", "sentinel-budget-baseline.json")
UNGUARDED = "sentinel-index-unguarded"
STRICT = "sentinel-index-strict-untested"
CODES = (UNGUARDED, STRICT)


def census():
    """scripts/sentinel-census.py as a module. Its name carries a dash, so it is loaded
    by path rather than imported — the alternative is a second copy of the walk, which is
    exactly what this file exists to prevent."""
    path = os.path.join(ROOT, "scripts", "sentinel-census.py")
    spec = importlib.util.spec_from_file_location("sentinel_census", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


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


def named(sc, root):
    """{code: {name: hits}} for one tree — the NAMED entries, `file:function`.

    HITS PER NAME, not a bare set: one function commonly carries several of these (a
    different table each), so a name that keeps its place while its count falls is a
    function that guarded one of two, which a set would show as no movement at all."""
    saved, sc.ROOT = sc.ROOT, root
    try:
        out = {c: {} for c in CODES}
        for h in sc.all_hits():
            k = h.key()
            out[h.code][k] = out[h.code].get(k, 0) + 1
        return out
    finally:
        sc.ROOT = saved


def tree_at(commit):
    """`compiler/` as of `commit`, unpacked by `archive | tar -x` and NEVER by a
    checkout: this runs beside a working tree somebody is editing. The caller removes the
    directory."""
    tmp = tempfile.mkdtemp(prefix="sentinel-budget-")
    try:
        arch = subprocess.run(["git", "-C", ROOT, "archive", commit, "compiler"],
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if arch.returncode != 0:
            raise SystemExit(f"sentinel-budget: `archive {commit}` failed: "
                             + arch.stderr.decode(errors="replace").strip())
        tar = subprocess.run(["tar", "-x", "-C", tmp], input=arch.stdout,
                             stderr=subprocess.PIPE)
        if tar.returncode != 0:
            raise SystemExit("sentinel-budget: could not unpack the archive: "
                             + tar.stderr.decode(errors="replace").strip())
        return tmp
    except BaseException:
        shutil.rmtree(tmp, ignore_errors=True)
        raise


def head_commit():
    r = subprocess.run(["git", "-C", ROOT, "rev-parse", "--short", "HEAD"],
                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    return r.stdout.decode().strip() if r.returncode == 0 else ""


def load_baseline():
    with open(BASELINE, encoding="utf-8") as fh:
        return json.load(fh)


def write_baseline(cur):
    total = {c: sum(v[c] for v in cur.values()) for c in CODES}
    rows = [f'{json.dumps(k)}: {json.dumps(v)}' for k, v in sorted(cur.items())]
    body = "\n".join([
        "{",
        f'"commit": {json.dumps(head_commit())},',
        f'"total": {json.dumps(total)},',
        '"files": {',
        ",\n".join(rows),
        "}",
        "}",
    ])
    with open(BASELINE, "w", encoding="utf-8") as fh:
        fh.write(body + "\n")
    print(f"wrote {BASELINE}: {total[UNGUARDED]} unguarded reads, "
          f"{total[STRICT]} untested strict reads")


def cmd_check(cur):
    base = load_baseline()["files"]
    bad = []
    for rel, v in sorted(cur.items()):
        b = base.get(rel, {})
        for c in CODES:
            if v[c] > b.get(c, 0):
                bad.append(f"  {rel}  {c}: {v[c]} (baseline {b.get(c, 0)})")
    if bad:
        print("sentinel-index budget REGRESSED — a file may only go down or stay:")
        print("\n".join(bad))
        print(
            "\nA table read whose index came from a reader that can answer in band must\n"
            "be bound-tested — `if i < 0 || i >= tbl.length { … }` — or must take a\n"
            "reader whose miss cannot be a real row. `vl check` returns 0 either way;\n"
            "the difference is whether the COMPILER traps (D1440, D1462, D1500, #2498).\n"
            "After a real fix, lower the baseline with\n"
            "  python3 scripts/sentinel-budget.py --write-baseline"
        )
        return 1
    tot = {c: sum(v[c] for v in cur.values()) for c in CODES}
    was = load_baseline()["total"]
    print(f"sentinel-index budget ok — {tot[UNGUARDED]} unguarded reads, "
          f"{tot[STRICT]} untested strict reads (baseline or below)")
    # A FALL is where `--why` earns its place: "it went down" and "it went down because
    # that function grew the guard" are different confidence levels, and only the second
    # rules out a detector that stopped seeing something.
    if any(tot[c] < was.get(c, 0) for c in CODES):
        print("  below baseline — `python3 scripts/sentinel-budget.py --why` names "
              "which entries left")
    return 0


def cmd_why(sc, since):
    """What LEFT and what ENTERED the reported set since the baseline was written.

    The baseline's `commit` says which tree its numbers describe; `--why <rev>` overrides
    it. Both sides are re-derived by the SAME walk, so a name that left is a name that
    stopped qualifying — not a parser that stopped matching."""
    base = load_baseline()
    at = since or base.get("commit", "")
    if not at:
        raise SystemExit(
            "sentinel-budget: the baseline records no `commit`, so a fall cannot be\n"
            "attributed. Pass one — `--why <rev>` — or re-run `--write-baseline`,\n"
            "which records the tree its numbers were taken from.")
    tmp = tree_at(at)
    try:
        was = named(sc, tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    now = named(sc, ROOT)
    print(f"sentinel-index: {at} -> working tree\n")
    moved = 0
    for code in CODES:
        a, b = was[code], now[code]
        print(f"{code}  {sum(a.values())} hits over {len(a)} names -> "
              f"{sum(b.values())} over {len(b)}")
        for n in sorted(set(a) - set(b)):
            print(f"  LEFT     {n}" + (f"  (x{a[n]})" if a[n] > 1 else ""))
            moved += 1
        for n in sorted(set(b) - set(a)):
            print(f"  ENTERED  {n}" + (f"  (x{b[n]})" if b[n] > 1 else ""))
            moved += 1
        for n in sorted(set(a) & set(b)):
            if a[n] != b[n]:
                print(f"  {n}  {a[n]} -> {b[n]}")
                moved += 1
        if sum(a.values()) == sum(b.values()) and set(a) == set(b):
            print("  (the same entries, by name)")
        print()
    if moved == 0:
        print("Nothing moved by name. A count that differs without a name moving is "
              "the instrument, not the tree.")
    return 0


def cmd_exempt_codes():
    """The codes scripts/lint-self.sh still tolerates: exactly those the committed
    baseline still owes. At zero this prints nothing and the gate bites."""
    total = load_baseline()["total"]
    print(" ".join(c for c in CODES if total.get(c, 0) > 0))
    return 0


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
        return cmd_exempt_codes()
    sc = census()
    if "--why" in args:
        i = args.index("--why")
        return cmd_why(sc, args[i + 1] if len(args) > i + 1 else "")
    if "--grade" in args:
        return cmd_grade(sc, args[args.index("--grade") + 1])
    if "--list" in args:
        i = args.index("--list")
        code = args[i + 1] if len(args) > i + 1 else UNGUARDED
        return cmd_list(sc, code, int(args[i + 2]) if len(args) > i + 2 else 0)
    cur = current(sc)
    if "--write-baseline" in args:
        write_baseline(cur)
        return 0
    if "--check" in args:
        return cmd_check(cur)
    tot = {c: sum(v[c] for v in cur.values()) for c in CODES}
    print(f"{'file':<32}{UNGUARDED:>28}{STRICT:>34}")
    for rel, v in sorted(cur.items(), key=lambda kv: -kv[1][UNGUARDED]):
        print(f"{rel:<32}{v[UNGUARDED]:>28}{v[STRICT]:>34}")
    print(f"{'TOTAL':<32}{tot[UNGUARDED]:>28}{tot[STRICT]:>34}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
