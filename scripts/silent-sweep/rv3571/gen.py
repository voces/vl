#!/usr/bin/env python3
"""The rv3571 named set's grid: `let r = x ?? "<member>"` in a generic (`<T>`) or hole body, then a
store `r = <value>`, then a read, at null / member / mixed pins of `K | null`. The #3571 review
graded it after D3423 kept a member `??` default's literal union `K`: the 32 cells that store the
NON-member `"zz"` ran on master at the null pin (and `==` at every pin), and are refused at check
time on the candidate, as the direct twin `g(x: K | null)` is refused on master. At the other pins
master printed wrong values for the same store. Writes the `manifest.json` `d243/mkset.py` reads
(`coords`, `expect`); `expect` is filled for the named cells only, with master's output.

    python3 scripts/silent-sweep/rv3571/gen.py /tmp/rv3571grid
    python3 scripts/silent-sweep/d243/mkset.py /tmp/rv3571set \\
        scripts/silent-sweep/census/rv3571-nonmember-store-price.json /tmp/rv3571grid
"""
import itertools
import json
import os
import sys

PRE = 'type K = "a" | "b"\nfunction takeK(k: K): string { return "k:" + k }'
FACES = {"T": "function g<T>(x: T)", "hole": "function g(x)"}
PINS = {"nul": [("K | null", "null")], "a": [("K", '"a"')],
        "MULTI": [("K", '"a"'), ("K | null", "null"), ("K | null", '"b"')]}
WRITES = {"nonmem": '"zz"', "lit": '"b"'}
READS = {"print": "print(r)", "eq": 'print(r == "b")', "len": "print(r.length)",
         "concat": 'print(r + "!")', "copy": "const q = r\n  print(q)", "interp": 'print("v=\\{r}")'}
EXPECT = {}
for face, d in itertools.product(FACES, "ab"):
    for rd, want in (("print", "zz"), ("eq", "false"), ("len", "2"), ("concat", "zz!"),
                     ("copy", "zz"), ("interp", "v=zz")):
        EXPECT[f"rv3571_{face}_nul_nonmem_{rd}_{d}"] = want
    EXPECT[f"rv3571_{face}_a_nonmem_eq_{d}"] = "false"
    EXPECT[f"rv3571_{face}_MULTI_nonmem_eq_{d}"] = "false\nfalse\nfalse"

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
expect, coords = {}, {}
for face, pin, wr, rd, d in itertools.product(FACES, PINS, WRITES, READS, "ab"):
    L = [PRE, FACES[face] + " {", f'  let r = x ?? "{d}"', f"  r = {WRITES[wr]}", "  " + READS[rd], "}"]
    for i, (ty, lit) in enumerate(PINS[pin]):
        L += [f"const v{i}: {ty} = {lit}", f"g(v{i})"]
    name = f"rv3571_{face}_{pin}_{wr}_{rd}_{d}"
    with open(os.path.join(out, name + ".vl"), "w") as f:
        f.write("\n".join(L) + "\n")
    coords[name] = {"face": face, "pin": pin, "write": wr, "read": rd, "default": d}
    if name in EXPECT:
        expect[name] = EXPECT[name]
json.dump({"expect": expect, "coords": coords, "skips": {}, "block": "rv3571",
           "generated": len(coords)}, open(os.path.join(out, "manifest.json"), "w"))
print("generated %d cells, %d named" % (len(coords), len(expect)))
