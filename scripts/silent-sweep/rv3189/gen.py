#!/usr/bin/env python3
"""The grid behind #3189's recorded price: the 7 cells its review named moving loud -> silent
when integer-keyed maps became union members, each into a defect master already has at the
string key. D2648: an inferred join of two maps with different key reps (the `o6_join` cells).
D2659: an aliased `{[K]: Rec} | i32 | null` lowered as the atom's niche (the `o2_global` cells).
D2657: a generic pin landing two union members on one map rep (`k4`). The cells are copied from
the review's generator (`rv3189-p/gen.py`) and witness set. Writes the cells and the
`manifest.json` that `d243/mkset.py` reads.

    python3 scripts/silent-sweep/rv3189/gen.py /tmp/rv3189grid
    python3 scripts/silent-sweep/d243/mkset.py /tmp/rv3189set \\
        scripts/silent-sweep/census/rv3189-int-key-price.json /tmp/rv3189grid
"""
import json
import os
import sys

CELLS = {
 "d2648_rv3189_i32_i32_o6_join_is": {
  "grid": "i32_i32_o6_join_is",
  "src": "type Rec = { x: i32 }\ntype Rec2 = { y: i32 }\ntype L = \"p\" | \"q\"\ntype U = {[i32]: i32} | {[i64]: i32} | string\nfunction smk(): {[string]: i32} {\n  const m: {[string]: i32} = Map()\n  m.set(\"s\", 1)\n  m\n}\nfunction i64mk(): {[i64]: i32} {\n  const m: {[i64]: i32} = Map()\n  m.set(8, 1)\n  m\n}\nfunction ismk(): {[i32]: string} {\n  const m: {[i32]: string} = Map()\n  m.set(8, \"t\")\n  m\n}\nfunction f(u: U) {\n  if u is {[i32]: i32} {\n    u.set(5, 11)\n    u.set(-3, 22)\n    u[100000] = 33\n    u.set(5, 44)\n    u.delete(-3)\n    print(u.has(-3))\n    print(u.has(5))\n    print(u.length)\n    print(u.get(5) ?? -1)\n    print(u.get(-3) ?? -1)\n    print(u[100000] ?? -1)\n    for k, v in u { print(k)\n      print(v) }\n  } else { print(\"other\") }\n}\nfunction g(u: U) {\n  if u is {[i32]: i32} {\n    print(u.length)\n    print(u.get(100000) ?? -1)\n  } else { print(\"other2\") }\n}\nconst m0: {[i32]: i32} = Map()\nfunction pick(c: boolean) {\n  if c { return m0 }\n  const o: {[i64]: i32} = i64mk()\n  o\n}\nconst u = pick(true)\nf(u)\ng(u)\nprint(m0.length)\nconst ov: {[i64]: i32} = i64mk()\nf(ov)\n",
  "want": "false then true then 2 then 44 then -1 then 33 then 5 then 44 then 100000 then 33 then 2 then 33 then 2 then other"
 },
 "d2648_rv3189_i32_i32_o6_join_match": {
  "grid": "i32_i32_o6_join_match",
  "src": "type Rec = { x: i32 }\ntype Rec2 = { y: i32 }\ntype L = \"p\" | \"q\"\ntype U = {[i32]: i32} | {[i64]: i32} | string\nfunction smk(): {[string]: i32} {\n  const m: {[string]: i32} = Map()\n  m.set(\"s\", 1)\n  m\n}\nfunction i64mk(): {[i64]: i32} {\n  const m: {[i64]: i32} = Map()\n  m.set(8, 1)\n  m\n}\nfunction ismk(): {[i32]: string} {\n  const m: {[i32]: string} = Map()\n  m.set(8, \"t\")\n  m\n}\nfunction f(u: U) {\n  match u {\n    {[i32]: i32} => {\n      u.set(5, 11)\n      u.set(-3, 22)\n      u[100000] = 33\n      u.set(5, 44)\n      u.delete(-3)\n      print(u.has(-3))\n      print(u.has(5))\n      print(u.length)\n      print(u.get(5) ?? -1)\n      print(u.get(-3) ?? -1)\n      print(u[100000] ?? -1)\n      for k, v in u { print(k)\n        print(v) }\n    }\n    {[i64]: i32} => print(\"other\")\n    string => print(\"other\")\n  }\n}\nfunction g(u: U) {\n  match u {\n    {[i32]: i32} => {\n      print(u.length)\n      print(u.get(100000) ?? -1)\n    }\n    {[i64]: i32} => print(\"other2\")\n    string => print(\"other2\")\n  }\n}\nconst m0: {[i32]: i32} = Map()\nfunction pick(c: boolean) {\n  if c { return m0 }\n  const o: {[i64]: i32} = i64mk()\n  o\n}\nconst u = pick(true)\nf(u)\ng(u)\nprint(m0.length)\nconst ov: {[i64]: i32} = i64mk()\nf(ov)\n",
  "want": "false then true then 2 then 44 then -1 then 33 then 5 then 44 then 100000 then 33 then 2 then 33 then 2 then other"
 },
 "d2657_rv3189_k4_generic_twin_pin": {
  "grid": "k4",
  "src": "function g<V>(m: V, n: {[i32]: i32}, c: boolean): i32 {\n  let u: V | {[i32]: i32} = n\n  if c { u = m }\n  if u is {[i32]: i32} { return 1 }\n  2\n}\nconst mb: {[i32]: boolean} = Map()\nconst mi: {[i32]: i32} = Map()\nprint(g(mb, mi, true))\nprint(g(mb, mi, false))\nprint(g(\"x\", mi, true))\n",
  "want": "1 then 2 then 2"
 },
 "d2659_rv3189_i32_Rec_o2_global_is": {
  "grid": "i32_Rec_o2_global_is",
  "src": "type Rec = { x: i32 }\ntype Rec2 = { y: i32 }\ntype L = \"p\" | \"q\"\ntype U = {[i32]: Rec} | i32 | string | null\nfunction smk(): {[string]: i32} {\n  const m: {[string]: i32} = Map()\n  m.set(\"s\", 1)\n  m\n}\nfunction i64mk(): {[i64]: i32} {\n  const m: {[i64]: i32} = Map()\n  m.set(8, 1)\n  m\n}\nfunction ismk(): {[i32]: string} {\n  const m: {[i32]: string} = Map()\n  m.set(8, \"t\")\n  m\n}\nfunction f(u: U) {\n  if u is {[i32]: Rec} {\n    u.set(5, { x: 1 })\n    u.set(-3, { x: 2 })\n    u[100000] = { x: 3 }\n    u.set(5, { x: 4 })\n    u.delete(-3)\n    print(u.has(-3))\n    print(u.has(5))\n    print(u.length)\n    const g8 = u.get(5)\n    if g8 != null { print(g8.x) } else { print(-1) }\n    const g10 = u.get(-3)\n    if g10 != null { print(g10.x) } else { print(-1) }\n    const g12 = u[100000]\n    if g12 != null { print(g12.x) } else { print(-1) }\n    for k, v in u { print(k)\n      print(v.x) }\n  } else { print(\"other\") }\n}\nfunction g(u: U) {\n  if u is {[i32]: Rec} {\n    print(u.length)\n    const g16 = u.get(100000)\n    if g16 != null { print(g16.x) } else { print(-1) }\n  } else { print(\"other2\") }\n}\nconst m0: {[i32]: Rec} = Map()\nlet gl: U = 42\ngl = m0\nf(gl)\ng(gl)\nprint(m0.length)\nconst ov: i32 = 42\nf(ov)\n",
  "want": "false then true then 2 then 4 then -1 then 3 then 5 then 4 then 100000 then 3 then 2 then 3 then 2 then other"
 },
 "d2659_rv3189_i32_Rec_o2_global_match": {
  "grid": "i32_Rec_o2_global_match",
  "src": "type Rec = { x: i32 }\ntype Rec2 = { y: i32 }\ntype L = \"p\" | \"q\"\ntype U = {[i32]: Rec} | i32 | string | null\nfunction smk(): {[string]: i32} {\n  const m: {[string]: i32} = Map()\n  m.set(\"s\", 1)\n  m\n}\nfunction i64mk(): {[i64]: i32} {\n  const m: {[i64]: i32} = Map()\n  m.set(8, 1)\n  m\n}\nfunction ismk(): {[i32]: string} {\n  const m: {[i32]: string} = Map()\n  m.set(8, \"t\")\n  m\n}\nfunction f(u: U) {\n  match u {\n    {[i32]: Rec} => {\n      u.set(5, { x: 1 })\n      u.set(-3, { x: 2 })\n      u[100000] = { x: 3 }\n      u.set(5, { x: 4 })\n      u.delete(-3)\n      print(u.has(-3))\n      print(u.has(5))\n      print(u.length)\n      const g8 = u.get(5)\n      if g8 != null { print(g8.x) } else { print(-1) }\n      const g10 = u.get(-3)\n      if g10 != null { print(g10.x) } else { print(-1) }\n      const g12 = u[100000]\n      if g12 != null { print(g12.x) } else { print(-1) }\n      for k, v in u { print(k)\n        print(v.x) }\n    }\n    i32 => print(\"other\")\n    string => print(\"other\")\n    null => print(\"other\")\n  }\n}\nfunction g(u: U) {\n  match u {\n    {[i32]: Rec} => {\n      print(u.length)\n      const g16 = u.get(100000)\n      if g16 != null { print(g16.x) } else { print(-1) }\n    }\n    i32 => print(\"other2\")\n    string => print(\"other2\")\n    null => print(\"other2\")\n  }\n}\nconst m0: {[i32]: Rec} = Map()\nlet gl: U = 42\ngl = m0\nf(gl)\ng(gl)\nprint(m0.length)\nconst ov: i32 = 42\nf(ov)\n",
  "want": "false then true then 2 then 4 then -1 then 3 then 5 then 4 then 100000 then 3 then 2 then 3 then 2 then other"
 },
 "d2659_rv3189_i64_Rec_o2_global_is": {
  "grid": "i64_Rec_o2_global_is",
  "src": "type Rec = { x: i32 }\ntype Rec2 = { y: i32 }\ntype L = \"p\" | \"q\"\ntype U = {[i64]: Rec} | i32 | string | null\nfunction smk(): {[string]: i32} {\n  const m: {[string]: i32} = Map()\n  m.set(\"s\", 1)\n  m\n}\nfunction i64mk(): {[i64]: i32} {\n  const m: {[i64]: i32} = Map()\n  m.set(8, 1)\n  m\n}\nfunction ismk(): {[i32]: string} {\n  const m: {[i32]: string} = Map()\n  m.set(8, \"t\")\n  m\n}\nfunction f(u: U) {\n  if u is {[i64]: Rec} {\n    u.set(5000000000, { x: 1 })\n    u.set(-3, { x: 2 })\n    u[7] = { x: 3 }\n    u.set(5000000000, { x: 4 })\n    u.delete(-3)\n    print(u.has(-3))\n    print(u.has(5000000000))\n    print(u.length)\n    const g8 = u.get(5000000000)\n    if g8 != null { print(g8.x) } else { print(-1) }\n    const g10 = u.get(-3)\n    if g10 != null { print(g10.x) } else { print(-1) }\n    const g12 = u[7]\n    if g12 != null { print(g12.x) } else { print(-1) }\n    for k, v in u { print(k)\n      print(v.x) }\n  } else { print(\"other\") }\n}\nfunction g(u: U) {\n  if u is {[i64]: Rec} {\n    print(u.length)\n    const g16 = u.get(7)\n    if g16 != null { print(g16.x) } else { print(-1) }\n  } else { print(\"other2\") }\n}\nconst m0: {[i64]: Rec} = Map()\nlet gl: U = 42\ngl = m0\nf(gl)\ng(gl)\nprint(m0.length)\nconst ov: i32 = 42\nf(ov)\n",
  "want": "false then true then 2 then 4 then -1 then 3 then 5000000000 then 4 then 7 then 3 then 2 then 3 then 2 then other"
 },
 "d2659_rv3189_i64_Rec_o2_global_match": {
  "grid": "i64_Rec_o2_global_match",
  "src": "type Rec = { x: i32 }\ntype Rec2 = { y: i32 }\ntype L = \"p\" | \"q\"\ntype U = {[i64]: Rec} | i32 | string | null\nfunction smk(): {[string]: i32} {\n  const m: {[string]: i32} = Map()\n  m.set(\"s\", 1)\n  m\n}\nfunction i64mk(): {[i64]: i32} {\n  const m: {[i64]: i32} = Map()\n  m.set(8, 1)\n  m\n}\nfunction ismk(): {[i32]: string} {\n  const m: {[i32]: string} = Map()\n  m.set(8, \"t\")\n  m\n}\nfunction f(u: U) {\n  match u {\n    {[i64]: Rec} => {\n      u.set(5000000000, { x: 1 })\n      u.set(-3, { x: 2 })\n      u[7] = { x: 3 }\n      u.set(5000000000, { x: 4 })\n      u.delete(-3)\n      print(u.has(-3))\n      print(u.has(5000000000))\n      print(u.length)\n      const g8 = u.get(5000000000)\n      if g8 != null { print(g8.x) } else { print(-1) }\n      const g10 = u.get(-3)\n      if g10 != null { print(g10.x) } else { print(-1) }\n      const g12 = u[7]\n      if g12 != null { print(g12.x) } else { print(-1) }\n      for k, v in u { print(k)\n        print(v.x) }\n    }\n    i32 => print(\"other\")\n    string => print(\"other\")\n    null => print(\"other\")\n  }\n}\nfunction g(u: U) {\n  match u {\n    {[i64]: Rec} => {\n      print(u.length)\n      const g16 = u.get(7)\n      if g16 != null { print(g16.x) } else { print(-1) }\n    }\n    i32 => print(\"other2\")\n    string => print(\"other2\")\n    null => print(\"other2\")\n  }\n}\nconst m0: {[i64]: Rec} = Map()\nlet gl: U = 42\ngl = m0\nf(gl)\ng(gl)\nprint(m0.length)\nconst ov: i32 = 42\nf(ov)\n",
  "want": "false then true then 2 then 4 then -1 then 3 then 5000000000 then 4 then 7 then 3 then 2 then 3 then 2 then other"
 }
}

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
coords, expect = {}, {}
for name, c in sorted(CELLS.items()):
    open(os.path.join(out, name + ".vl"), "w").write(c["src"])
    coords[name] = {"grid": c["grid"]}
    expect[name] = c["want"]
json.dump({"coords": coords, "expect": expect, "block": "rv3189", "generated": len(coords)},
          open(os.path.join(out, "manifest.json"), "w"), indent=1, sort_keys=True)
print("wrote %d cells into %s" % (len(coords), out))
