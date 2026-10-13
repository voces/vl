#!/usr/bin/env python3
"""The grid behind #3175's recorded price: the 8 cells of its review grid (`<type>__<body>__<pos>`)
that moved loud -> silent or trap into a defect master already has in another spelling. D2594
is a popped map bound and returned; D2595 is a `Map()` in a generic at a literal-union `T`;
D2596 is a null `string | null` variable stored into a map. Writes the cells and the `manifest.json` that `d243/mkset.py` reads.

    python3 scripts/silent-sweep/rv3175/gen.py /tmp/rv3175grid
    python3 scripts/silent-sweep/d243/mkset.py /tmp/rv3175set \\
        scripts/silent-sweep/census/rv3175-generic-return-price.json /tmp/rv3175grid
"""
import json
import os
import sys

CELLS = {
 "d2594_pop_empty__map_bind": {
  "grid": "map__pop_empty__bind",
  "src": "type P = { x: i32 }\ntype Dir = \"n\" | \"s\"\ntype Box<T> = { v: T }\nconst A1: {[string]: i32} = Map()\nA1[\"a\"] = 1\nconst A2: {[string]: i32} = Map()\nA2[\"a\"] = 2\nconst E: {[string]: i32}[] = []\nfunction show(v: {[string]: i32}) {\n  print(v[\"a\"] ?? -1)\n}\nfunction f<T>(xs: T[]) {\n  const y = xs.pop()\n  return y\n}\nconst r = f(E)\nif r != null { show(r) } else { print(\"none\") }\n",
  "want": "none"
 },
 "d2594_pop_empty__map_direct": {
  "grid": "map__pop_empty__direct",
  "src": "type P = { x: i32 }\ntype Dir = \"n\" | \"s\"\ntype Box<T> = { v: T }\nconst A1: {[string]: i32} = Map()\nA1[\"a\"] = 1\nconst A2: {[string]: i32} = Map()\nA2[\"a\"] = 2\nconst E: {[string]: i32}[] = []\nfunction show(v: {[string]: i32}) {\n  print(v[\"a\"] ?? -1)\n}\nfunction f<T>(xs: T[]) {\n  const y = xs.pop()\n  return y\n}\nconst r = f(E)\nif r != null { show(r) } else { print(\"none\") }\n",
  "want": "none"
 },
 "d2594_pop_empty__set_bind": {
  "grid": "set__pop_empty__bind",
  "src": "type P = { x: i32 }\ntype Dir = \"n\" | \"s\"\ntype Box<T> = { v: T }\nconst A1: Set<string> = Set()\nA1.add(\"a\")\nconst A2: Set<string> = Set()\nA2.add(\"b\")\nA2.add(\"c\")\nconst E: Set<string>[] = []\nfunction show(v: Set<string>) {\n  print(v.length)\n}\nfunction f<T>(xs: T[]) {\n  const y = xs.pop()\n  return y\n}\nconst r = f(E)\nif r != null { show(r) } else { print(\"none\") }\n",
  "want": "none"
 },
 "d2594_pop_empty__set_direct": {
  "grid": "set__pop_empty__direct",
  "src": "type P = { x: i32 }\ntype Dir = \"n\" | \"s\"\ntype Box<T> = { v: T }\nconst A1: Set<string> = Set()\nA1.add(\"a\")\nconst A2: Set<string> = Set()\nA2.add(\"b\")\nA2.add(\"c\")\nconst E: Set<string>[] = []\nfunction show(v: Set<string>) {\n  print(v.length)\n}\nfunction f<T>(xs: T[]) {\n  const y = xs.pop()\n  return y\n}\nconst r = f(E)\nif r != null { show(r) } else { print(\"none\") }\n",
  "want": "none"
 },
 "d2595_map_val_inf__lit_ann": {
  "grid": "lit__map_val_inf__ann",
  "src": "type P = { x: i32 }\ntype Dir = \"n\" | \"s\"\ntype Box<T> = { v: T }\nconst A1: Dir = \"n\"\nconst A2: Dir = \"s\"\nfunction show(v: Dir) {\n  print(v)\n}\nfunction f<T>(x: T): {[string]: T} {\n  const m = Map()\n  m[\"k\"] = x\n  m\n}\nconst r: (Dir) | null = f(A1)[\"k\"]\nif r != null { show(r) } else { print(\"none\") }\n",
  "want": "n"
 },
 "d2595_map_val_inf__lit_bind": {
  "grid": "lit__map_val_inf__bind",
  "src": "type P = { x: i32 }\ntype Dir = \"n\" | \"s\"\ntype Box<T> = { v: T }\nconst A1: Dir = \"n\"\nconst A2: Dir = \"s\"\nfunction show(v: Dir) {\n  print(v)\n}\nfunction f<T>(x: T): {[string]: T} {\n  const m = Map()\n  m[\"k\"] = x\n  m\n}\nconst r = f(A1)[\"k\"]\nif r != null { show(r) } else { print(\"none\") }\n",
  "want": "n"
 },
 "d2595_map_val_inf__lit_direct": {
  "grid": "lit__map_val_inf__direct",
  "src": "type P = { x: i32 }\ntype Dir = \"n\" | \"s\"\ntype Box<T> = { v: T }\nconst A1: Dir = \"n\"\nconst A2: Dir = \"s\"\nfunction show(v: Dir) {\n  print(v)\n}\nfunction f<T>(x: T): {[string]: T} {\n  const m = Map()\n  m[\"k\"] = x\n  m\n}\nconst r = f(A1)[\"k\"]\nif r != null { show(r) } else { print(\"none\") }\n",
  "want": "n"
 },
 "d2596_mapval_inf__nstr": {
  "grid": "ns__mapval_inf",
  "src": "const B: string | null = null\nfunction f<T>(x: T): {[string]: T} { const m = Map(); m[\"k\"] = x; m }\nconst r = f(B)[\"k\"]\nif r == null { print(\"null\") } else { print(r) }\n",
  "want": "null"
 }
}

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
coords, expect = {}, {}
for name, c in sorted(CELLS.items()):
    open(os.path.join(out, name + ".vl"), "w").write(c["src"])
    coords[name] = {"grid": c["grid"]}
    expect[name] = c["want"]
json.dump({"coords": coords, "expect": expect, "block": "rv3175", "generated": len(coords)},
          open(os.path.join(out, "manifest.json"), "w"), indent=1, sort_keys=True)
print("wrote %d cells into %s" % (len(coords), out))
