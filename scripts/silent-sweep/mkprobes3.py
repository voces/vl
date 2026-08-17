#!/usr/bin/env python3
import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "probes3")
os.makedirs(OUT, exist_ok=True)
P = {}

# --- narrowed assignment: is the assignment target checked against the NARROWED type? ---
P["s_narrowassign_if"] = """
function body(p: string | null) {
  let q: string | null = p
  if q != null { print(q)
    q = null }
  if q != null { print("STILL") } else { print("N") }
}
body("a")
body(null)
"""

P["s_narrowassign_ctl"] = """
function body(p: string | null) {
  let q: string | null = p
  if q != null { print(q) }
  q = null
  if q != null { print("STILL") } else { print("N") }
}
body("a")
body(null)
"""

# --- map value read x value rep ---
def mapcell(vty, setv, rd):
    return f"""
function body() {{
  const m: {{[string]: {vty}}} = Map()
  m["k"] = {setv}
  const v = m["k"]
  if v != null {{ {rd} }} else {{ print("N") }}
}}
body()
"""

P["s_mv_i32"] = mapcell("i32", "5", "print(v)")
P["s_mv_i64"] = mapcell("i64", "5", "print(v)")
P["s_mv_f64"] = mapcell("f64", "5.5", "print(v)")
P["s_mv_f32"] = mapcell("f32", "5.5", "print(v)")
P["s_mv_bool"] = mapcell("boolean", "true", "print(v)")
P["s_mv_str"] = mapcell("string", '"z"', "print(v)")
P["s_mv_struct"] = "type S = { w: i32 }\n" + mapcell("S", "{ w: 3 }", "print(v.w)")
P["s_mv_list"] = mapcell("i32[]", "[1,2]", "print(v.length)")
P["s_mv_strlist"] = mapcell("string[]", '["a"]', "print(v.length)")
P["s_mv_clo"] = mapcell("(i32) => i32", "(x) => x + 1", "print(v(3))")
P["s_mv_K"] = 'type K = "p" | "q"\n' + mapcell("K", '"p"', "print(v)")
P["s_mv_nulstr"] = mapcell("string | null", '"z"', "print(v)")

# is-based narrowing of a map value read
P["s_mv_i32_is"] = mapcell("i32", "5", "print(v)").replace("v != null", "v is i32")
P["s_mv_str_is"] = mapcell("string", '"z"', "print(v)").replace("v != null", "v is string")

# --- return null from each niche ---
P["s_retnull"] = """
type S = { w: i32 }
function f1(): string | null { return null }
function f2(): boolean | null { return null }
function f3(): S | null { return null }
function f4(): i32[] | null { return null }
function f5(): string[] | null { return null }
function f6(): f64[] | null { return null }
function f7(): i64[] | null { return null }
function f8(): f32[] | null { return null }
function f9(): S[] | null { return null }
function f10(): ((i32) => i32) | null { return null }
function f11(): {[string]: i32} | null { return null }
function f12(): i32 | null { return null }
print(f1() == null)
print(f2() == null)
print(f3() == null)
print(f4() == null)
print(f5() == null)
print(f6() == null)
print(f7() == null)
print(f8() == null)
print(f9() == null)
print(f10() == null)
print(f11() == null)
print(f12() == null)
"""

# --- map basic reads that are not index gets ---
P["s_mapreads"] = """
function body() {
  const m: {[string]: i32} = Map()
  m["k"] = 5
  m["j"] = 6
  print(m.size)
  for k in m.keys() { print(k) }
  for v in m.values() { print(v) }
}
body()
"""

# --- print of an un-narrowed nullable of each niche ---
P["s_printunnarrowed"] = """
type S = { w: i32 }
function b3(p: S | null) { print(p) }
b3(null)
"""
P["s_printunnarrowed_list"] = """
function b4(p: i32[] | null) { print(p) }
b4(null)
"""

# --- loop var over a list of each rep ---
P["s_loopvar"] = """
type S = { w: i32 }
type K = "p" | "q"
function body() {
  for a in [1, 2] { print(a) }
  const b: i64[] = [3, 4]
  for c in b { print(c) }
  const d: f64[] = [1.5]
  for e in d { print(e) }
  const f: f32[] = [2.5]
  for g in f { print(g) }
  const h: boolean[] = [true]
  for i in h { print(i) }
  const j: string[] = ["s"]
  for k in j { print(k) }
  const l: K[] = ["p"]
  for m in l { print(m) }
  const n: S[] = [{ w: 9 }]
  for o in n { print(o.w) }
}
body()
"""

# --- map / filter ---
P["s_mapfilter"] = """
function body() {
  const xs: i32[] = [1, 2, 3]
  const ys = xs.map((x) => x + 1)
  print(ys.length)
  const zs = xs.filter((x) => x > 1)
  print(zs.length)
}
body()
"""

# --- evaluation-count probe: does print(f()) run f once? ---
P["s_evalcount"] = """
let nCalls = 0
function f(): i32 { nCalls = nCalls + 1
  return 3 }
print(f())
print(nCalls)
"""

P["s_evalcount_union"] = """
let nCalls = 0
function f(): string | i32 { nCalls = nCalls + 1
  return 3 }
function body() {
  const u = f()
  if u is string { print(u) } else { print(u) }
}
body()
print(nCalls)
"""

P["s_evalcount_nul"] = """
let nCalls = 0
function f(): string | null { nCalls = nCalls + 1
  return "a" }
print(f() ?? "D")
print(nCalls)
"""

# --- optional chaining forms ---
P["s_optchain2"] = """
type S = { w: i32 }
function body(a: S | null) {
  if a?.w != null { print("HAS") } else { print("N") }
}
body({ w: 3 })
body(null)
"""

P["s_optchain3"] = """
type S = { g: string | null }
function body(a: S | null) {
  const t = a?.g
  if t != null { print(t) } else { print("N") }
}
body({ g: "x" })
body(null)
"""

for name, body in P.items():
    open(os.path.join(OUT, name + ".vl"), "w").write(body.lstrip("\n"))
print("wrote", len(P))
