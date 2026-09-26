#!/usr/bin/env python3
"""The D2572 named set's grid: a generic that binds a slice of `[null, x]` and returns the
binding, read by element at a `string` instance. #3174's review found it moving loud -> silent
(master refused `string index access but string list type not collected`; D2554's exclusion
lifted, it is check-clean invalid wasm inside `g`). Writes the `manifest.json`
`d243/mkset.py` reads (`coords`, `expect`).

    python3 scripts/silent-sweep/d2572/gen.py /tmp/d2572grid
    python3 scripts/silent-sweep/d243/mkset.py /tmp/d2572set \\
        scripts/silent-sweep/census/d2572-generic-nullable-slice-bind.json /tmp/d2572grid
"""
import json
import os
import sys

SRC = """function g<T>(x: T) {
  const q = [null, x].slice(1)
  return q
}
const r = g("s")
print(r[0] == null)
"""

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
name = "d2572_slice_bind__str_idx"
open(os.path.join(out, name + ".vl"), "w").write(SRC)
coords = {name: {"op": "slice", "inst": "string", "read": "index"}}
expect = {name: "false"}
json.dump({"coords": coords, "expect": expect, "block": "d2572", "generated": len(coords)},
          open(os.path.join(out, "manifest.json"), "w"), indent=1, sort_keys=True)
print("wrote %d cells into %s" % (len(coords), out))
