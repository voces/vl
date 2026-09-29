#!/usr/bin/env python3
"""The D3079 named set's grid: a list literal joining a generic's `x: T` with a concrete element
(`[x, 7]`, `[7, x]`, `[x, x, 7]`, `[x, 7.5]`) and a body reading it, at five pins. The #3275
review graded it after the candidate typed that literal `(T | i32)[]` in the body: 56 cells that
run on master, and whose direct twin (`const x = <pin>`) runs, were refused at check time, since
an operator over `T | i32` is refused at every pin. Writes the `manifest.json`
`d243/mkset.py` reads (`coords`, `expect`); `expect` is filled for the named cells only.

    python3 scripts/silent-sweep/d3079/gen.py /tmp/d3079grid
    python3 scripts/silent-sweep/d243/mkset.py /tmp/d3079set \\
        scripts/silent-sweep/census/d3079-apart-join-price.json /tmp/d3079grid
"""
import itertools
import json
import os
import sys

BODIES = {
    "add0": "print(l[0] + 1)", "add1": "print(l[1] + 1)", "gt": "print(l[0] > 4)",
    "mul": "print(l[0] * 2)", "fold": "let s = l[0]\n  for e in l { s = s + e }\n  print(s)",
    "pr": "print(l[0])", "eq": "print(l[0] == 7)", "leti32": "const y: i32 = l[0]\n  print(y)",
    "len": "print(l[0].length)", "neg": "print(-l[0])", "sum2": "print(l[0] + l[1])",
    "llen": "print(l.length)", "forpr": "for e in l { print(e) }", "ret": None,
}
LITS = {"x7": "[x, 7]", "7x": "[7, x]", "xx7": "[x, x, 7]", "x75": "[x, 7.5]"}
PINS = {"i32": "3", "f64": "2.5", "str": '"s"', "bool": "true", "i64": "(5 as i64)"}

# What master prints for each named cell (its direct twin prints the same).
EXPECT = {
    "d3079_add0_7x_i32": "8",
    "d3079_add0_x75_f64": "3.5",
    "d3079_add0_x7_f64": "3.5",
    "d3079_add0_x7_i32": "4",
    "d3079_add0_x7_i64": "6",
    "d3079_add0_xx7_f64": "3.5",
    "d3079_add0_xx7_i32": "4",
    "d3079_add0_xx7_i64": "6",
    "d3079_add1_7x_i32": "4",
    "d3079_add1_x75_f64": "8.5",
    "d3079_add1_x7_f64": "8",
    "d3079_add1_x7_i32": "8",
    "d3079_add1_x7_i64": "8",
    "d3079_add1_xx7_f64": "3.5",
    "d3079_add1_xx7_i32": "4",
    "d3079_add1_xx7_i64": "6",
    "d3079_fold_7x_i32": "17",
    "d3079_fold_x75_f64": "12.5",
    "d3079_fold_x7_f64": "12",
    "d3079_fold_x7_i32": "13",
    "d3079_fold_x7_i64": "17",
    "d3079_fold_xx7_f64": "14.5",
    "d3079_fold_xx7_i32": "16",
    "d3079_fold_xx7_i64": "22",
    "d3079_gt_7x_i32": "true",
    "d3079_gt_x75_f64": "false",
    "d3079_gt_x7_f64": "false",
    "d3079_gt_x7_i32": "false",
    "d3079_gt_x7_i64": "true",
    "d3079_gt_xx7_f64": "false",
    "d3079_gt_xx7_i32": "false",
    "d3079_gt_xx7_i64": "true",
    "d3079_mul_7x_i32": "14",
    "d3079_mul_x75_f64": "5",
    "d3079_mul_x7_f64": "5",
    "d3079_mul_x7_i32": "6",
    "d3079_mul_x7_i64": "10",
    "d3079_mul_xx7_f64": "5",
    "d3079_mul_xx7_i32": "6",
    "d3079_mul_xx7_i64": "10",
    "d3079_neg_7x_i32": "-7",
    "d3079_neg_x75_f64": "-2.5",
    "d3079_neg_x7_f64": "-2.5",
    "d3079_neg_x7_i32": "-3",
    "d3079_neg_x7_i64": "-5",
    "d3079_neg_xx7_f64": "-2.5",
    "d3079_neg_xx7_i32": "-3",
    "d3079_neg_xx7_i64": "-5",
    "d3079_sum2_7x_i32": "10",
    "d3079_sum2_x75_f64": "10",
    "d3079_sum2_x7_f64": "9.5",
    "d3079_sum2_x7_i32": "10",
    "d3079_sum2_x7_i64": "12",
    "d3079_sum2_xx7_f64": "5",
    "d3079_sum2_xx7_i32": "6",
    "d3079_sum2_xx7_i64": "10"
}


def prog(body, lit, pin):
    if body == "ret":
        return ("function f<T>(x: T) {\n  const l = " + lit + "\n  return l\n}\nconst r = f(" + pin
                + ")\nprint(r[0])\nprint(r.length)\n")
    return "function f<T>(x: T) {\n  const l = " + lit + "\n  " + BODIES[body] + "\n}\nf(" + pin + ")\n"


out = sys.argv[1]
os.makedirs(out, exist_ok=True)
coords, expect = {}, {}
for b, l, p in itertools.product(BODIES, LITS, PINS):
    name = "d3079_%s_%s_%s" % (b, l, p)
    open(os.path.join(out, name + ".vl"), "w").write(prog(b, LITS[l], PINS[p]))
    coords[name] = {"body": b, "lit": l, "pin": p}
    if name in EXPECT:
        expect[name] = EXPECT[name]
json.dump({"coords": coords, "expect": expect, "block": "d3079", "generated": len(coords)},
          open(os.path.join(out, "manifest.json"), "w"), indent=1, sort_keys=True)
print("wrote %d cells into %s" % (len(coords), out))
