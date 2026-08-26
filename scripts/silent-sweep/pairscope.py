#!/usr/bin/env python3
"""
PAIRED module-scope vs function-scope report for the scope axis.

The absolute silent count of a module-scope grid says nothing on its own: the module-scope
population is not the function-scope one (a parameter has no module-scope spelling, so 780
coordinates exist only at `scope=fn`).  What answers the question is the PAIR — the same
(leg, rep, nul, pos, con, read, inp, spell) coordinate graded at both scopes, so exactly one
thing differs between a cell and its control.

Prints:
  * the paired population and the unpaired remainder, with the reason,
  * silent totals per scope ON THE PAIRED POPULATION ONLY,
  * the full fn -> mod outcome transition table,
  * every coordinate that is silent at `mod` and not at `fn` (a scope-specific silent
    class) and every one silent at `fn` and not at `mod`,
  * every coordinate that moved LOUD -> SILENT in either direction, which is the
    regression direction this programme has been caught in three times.

Usage: pairscope.py <graded.csv> [--cells <celldir>]
"""
import csv, collections, sys

SILENT = {"wrong_value", "wrong_evalcount", "invalid_wasm", "trap", "compiler_trap"}
LOUD = {"loud_check_reject", "loud_emit_reject", "hint_only_rc1"}
KEY = ("leg", "rep", "nul", "pos", "con", "read", "inp", "spell")


def main():
    path = sys.argv[1]
    rows = list(csv.DictReader(open(path)))
    by = collections.defaultdict(dict)
    for r in rows:
        by[tuple(r[k] for k in KEY)][r["scope"]] = r

    paired = {k: v for k, v in by.items() if "fn" in v and "mod" in v}
    fn_only = {k: v for k, v in by.items() if "mod" not in v}
    mod_only = {k: v for k, v in by.items() if "fn" not in v}

    print(f"coordinates {len(by)}   paired {len(paired)}   "
          f"fn-only {len(fn_only)}   mod-only {len(mod_only)}")
    if fn_only:
        c = collections.Counter(k[KEY.index("pos")] for k in fn_only)
        print("  fn-only coordinates by position: " +
              ", ".join(f"{p}={n}" for p, n in c.most_common()))
    if mod_only:
        c = collections.Counter(k[KEY.index("pos")] for k in mod_only)
        print("  mod-only coordinates by position: " +
              ", ".join(f"{p}={n}" for p, n in c.most_common()))

    print(f"\n== PAIRED POPULATION ({len(paired)} coordinates, {2*len(paired)} cells) ==")
    for sc in ("fn", "mod"):
        c = collections.Counter(v[sc]["outcome"] for v in paired.values())
        sil = sum(c[k] for k in SILENT)
        print(f"  scope={sc:4s} correct {c['correct']:6d}   SILENT {sil:4d}   "
              f"loudchk {c['loud_check_reject']:5d}   loudemit {c['loud_emit_reject']:5d}")

    print("\n== transitions fn -> mod (paired only; identical outcomes omitted) ==")
    t = collections.Counter((v["fn"]["outcome"], v["mod"]["outcome"])
                            for v in paired.values())
    same = sum(n for (a, b), n in t.items() if a == b)
    print(f"  unchanged {same}")
    for (a, b), n in sorted(t.items(), key=lambda x: -x[1]):
        if a == b:
            continue
        flag = ""
        if a in LOUD and b in SILENT:
            flag = "   <-- LOUD -> SILENT (blocker direction)"
        if a in SILENT and b not in SILENT:
            flag = "   (silent -> not silent)"
        print(f"  {a:20s} -> {b:20s} {n:5d}{flag}")

    for a_sc, b_sc in (("mod", "fn"), ("fn", "mod")):
        hits = [(k, v) for k, v in paired.items()
                if v[a_sc]["outcome"] in SILENT and v[b_sc]["outcome"] not in SILENT]
        print(f"\n== silent at {a_sc} and NOT at {b_sc}: {len(hits)} coordinates ==")
        for k, v in sorted(hits):
            print("  " + " ".join(f"{n}={x}" for n, x in zip(KEY, k)))
            print(f"      {a_sc} cell {v[a_sc]['cell']} {v[a_sc]['outcome']}: "
                  f"{v[a_sc]['msg'][:110]}")
            print(f"      {b_sc} cell {v[b_sc]['cell']} {v[b_sc]['outcome']}")

    print("\n== every silent cell in the run, both scopes ==")
    for r in rows:
        if r["outcome"] in SILENT:
            print(f"  {r['cell']} scope={r['scope']:4s} {r['outcome']:14s} " +
                  " ".join(f"{n}={r[n]}" for n in KEY) + f"  :: {r['msg'][:90]}")


if __name__ == "__main__":
    main()
