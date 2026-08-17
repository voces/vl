#!/usr/bin/env python3
"""Verify every count quoted in docs/internals/silent-class-inventory.md."""
import csv, collections, sys
rows = []
for p in sys.argv[1:]:
    rows += list(csv.DictReader(open(p)))


def n(pred):
    return sum(1 for r in rows if pred(r))


def has(r, s):
    return s in r["msg"]


checks = [
    ("D9 capture, bare-null/ref-valtype loud emit",
     lambda r: r["pos"] == "capture" and r["outcome"] == "loud_emit_reject"
     and (has(r, "bare null needs a struct-typed context")
          or has(r, "ref valtype with no interned shape"))),
    ("D10 mapget/mapval numeric loud emit `bare null`",
     lambda r: r["pos"] == "mapget" and r["outcome"] == "loud_emit_reject"
     and has(r, "bare null needs a struct-typed context")),
    ("D11 `narrowed receiver names no union variant` (all)",
     lambda r: has(r, "narrowed receiver names no union variant")),
    ("D12 `unsupported expression in return` (all)",
     lambda r: has(r, "unsupported expression in return")),
    ("D12b `member access '?.` declines",
     lambda r: has(r, "member access '?.")),
    ("D13 `literal-union atom narrowing needs a re-readable receiver`",
     lambda r: has(r, "literal-union atom narrowing needs a re-readable receiver")),
    ("D14 `field access but no struct type declared`",
     lambda r: has(r, "field access but no struct type declared")),
    ("D15 '`??` is only supported on a map index get'",
     lambda r: has(r, "`??` is only supported on a map index get")),
    ("`match over a union with literal members`",
     lambda r: has(r, "match over a union with literal members")),
    ("print-of-union-value declines (all)",
     lambda r: has(r, "is type-valid but not yet supported by codegen")),
    ("doubled nullable render `??)`",
     lambda r: "??)" in r["msg"]),
    ("`narrowed union binding is not a local or global`",
     lambda r: has(r, "narrowed union binding is not a local or global")),
    ("`bare null needs a struct-typed context` (all)",
     lambda r: has(r, "bare null needs a struct-typed context")),
    ("`an i32-keyed Map/Set is supported as`",
     lambda r: has(r, "an i32-keyed Map/Set is supported as")),
    ("`cannot assign {f:` X to X (identical render)",
     lambda r: has(r, "cannot assign {f:")),
    ("optchain construct total", lambda r: r["con"] == "optchain"),
    ("optchain construct correct",
     lambda r: r["con"] == "optchain" and r["outcome"] == "correct"),
    ("list_f32 loud emit", lambda r: r["rep"] == "list_f32"
     and r["outcome"] == "loud_emit_reject"),
    ("list_f32 correct", lambda r: r["rep"] == "list_f32" and r["outcome"] == "correct"),
    ("leg E total", lambda r: r["leg"] == "E"),
    ("distinct reps present", None),
    ("distinct positions present", None),
]
for name, pred in checks:
    if pred is None:
        continue
    print(f"  {n(pred):6d}  {name}")
print(f"  {len(set(r['rep'] for r in rows)):6d}  distinct representations")
print(f"  {len(set(r['pos'] for r in rows)):6d}  distinct positions")
print(f"  {len(set(r['outcome'] for r in rows)):6d}  distinct outcome columns fired")
