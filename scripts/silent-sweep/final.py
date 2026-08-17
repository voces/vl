#!/usr/bin/env python3
"""Final tallies for the inventory: per-defect cell counts and the harness-artifact count."""
import csv, collections, sys

rows = []
for p in sys.argv[1:]:
    rows += list(csv.DictReader(open(p)))
N = len(rows)


def cnt(pred):
    return sum(1 for r in rows if pred(r))


print(f"TOTAL {N}")
print("\n--- HARNESS ARTEFACTS (excluded from the defect list, declared in the doc) ---")
a1 = cnt(lambda r: r["rep"] == "closure" and r["spell"] == "alias")
print(f"  closure nullable ALIAS spelled without parens (Leg E/G): {a1}")
a2 = cnt(lambda r: "no field 'd' on {c: i32}" in r["msg"])
print(f"  nested `is Cat` inside `is Cat` (plain is_t on a struct union): {a2}")
print(f"  TOTAL declared harness artefacts: {a1 + a2}")

print("\n--- SILENT DEFECT FAMILIES ---")
fams = [
    ("S1 nullable scalar-BOX captured, `!=null`/`==null`-else/andguard -> invalid wasm",
     lambda r: r["outcome"] == "invalid_wasm" and r["pos"] == "capture"),
    ("S2 for-in over <expr>.keys()/.values() evaluates the receiver twice",
     lambda r: r["outcome"] == "wrong_evalcount"),
    ("S3 forward-declared alias in a struct field -> wrong value / invalid wasm",
     lambda r: r["leg"] == "G" and r["spell"] == "fwd"
     and r["outcome"] in ("wrong_value", "invalid_wasm")),
    ("S4 i32-keyed map captured by a nested fn -> COMPILER trap",
     lambda r: r["outcome"] == "compiler_trap"),
    ("S5 narrowed nullable map + for-in .values()/.keys() -> invalid wasm",
     lambda r: r["outcome"] == "invalid_wasm" and r["rep"].startswith("map")
     and r["pos"] == "const_local"),
    ("S6 numeric-litunion map value, index read narrowed -> invalid wasm",
     lambda r: r["outcome"] == "invalid_wasm" and r["pos"] == "mapget"),
    ("S7 `xs[0] ?? d` over a nullable-element list -> invalid wasm",
     lambda r: r["outcome"] == "invalid_wasm" and r["pos"] == "elem_place"),
]
tot = 0
for name, pred in fams:
    n = cnt(pred)
    tot += n
    print(f"  {n:5d}  {name}")
print(f"  {tot:5d}  accounted for, of "
      f"{cnt(lambda r: r['outcome'] in ('wrong_value','wrong_evalcount','invalid_wasm','trap','compiler_trap'))} silent")

print("\n--- capture position, invalid_wasm by rep x construct ---")
c = collections.Counter((r["rep"], r["con"]) for r in rows
                        if r["outcome"] == "invalid_wasm" and r["pos"] == "capture")
for k in sorted(c):
    print(f"  {k[0]:10s} {k[1]:14s} {c[k]}")

print("\n--- capture position, ALL outcomes by rep (nullable leg) ---")
t = collections.defaultdict(collections.Counter)
for r in rows:
    if r["pos"] == "capture" and r["nul"] == "1":
        t[r["rep"]][r["outcome"]] += 1
for k in sorted(t):
    print(f"  {k:12s} {dict(t[k])}")

print("\n--- LOUD families worth filing (message -> cells) ---")
h = collections.Counter()
for r in rows:
    if r["outcome"] in ("loud_emit_reject", "loud_check_reject"):
        h[r["msg"][:95]] += 1
for m, n in h.most_common(28):
    print(f"  {n:5d}  {m}")
