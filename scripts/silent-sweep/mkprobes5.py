#!/usr/bin/env python3
import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "probes5")
os.makedirs(OUT, exist_ok=True)
P = {}

P["u_break"] = """
function body() {
  const xs: i32[] = [1, 2, 3]
  for x in xs { if x == 2 { break } print(x) }
}
body()
"""

P["u_whileguard"] = """
function body(p: string | null) {
  let n = 0
  while p != null && n < 1 {
    print(p)
    n = n + 1
  }
  print(n)
}
body("a")
body(null)
"""

P["u_place_field"] = """
type W = { f: string | null }
function body(w: W) {
  if w.f != null { print(w.f) } else { print("NUL") }
}
body({ f: "a" })
body({ f: null })
"""

P["u_place_field_i32"] = """
type W = { f: i32 | null }
function body(w: W) {
  if w.f != null { print(w.f) } else { print("NUL") }
}
body({ f: 7 })
body({ f: null })
"""

P["u_place_elem"] = """
function body() {
  const xs: (string | null)[] = ["a", null]
  if xs[0] != null { print(xs[0]) } else { print("NUL") }
  if xs[1] != null { print(xs[1]) } else { print("NUL") }
}
body()
"""

P["u_place_mapval"] = """
function body() {
  const m: {[string]: string} = Map()
  m["k"] = "z"
  if m["k"] != null { print(m["k"]) } else { print("NUL") }
}
body()
"""

P["u_place_global"] = """
const g: string | null = "a"
function body() {
  if g != null { print(g) } else { print("NUL") }
}
body()
"""

P["u_evalcount_place"] = """
let nCalls = 0
function key(): string { nCalls = nCalls + 1
  return "k" }
function body() {
  const m: {[string]: string} = Map()
  m["k"] = "z"
  if m[key()] != null { print(m[key()]) } else { print("NUL") }
  print(nCalls)
}
body()
"""

P["u_evalcount_arg"] = """
let nCalls = 0
function src(): i32 { nCalls = nCalls + 1
  return 3 }
function two(a: i32, b: i32): i32 { return a + b }
function body() {
  print(two(src(), 4))
  print(nCalls)
}
body()
"""

P["u_evalcount_forin"] = """
let nCalls = 0
function mk(): i32[] { nCalls = nCalls + 1
  return [1, 2] }
function body() {
  for x in mk() { print(x) }
  print(nCalls)
}
body()
"""

P["u_evalcount_ifexpr"] = """
let nCalls = 0
function src(): i32 { nCalls = nCalls + 1
  return 3 }
function body(flag: boolean) {
  const v = if flag { src() } else { 9 }
  print(v)
  print(nCalls)
}
body(true)
"""

P["u_evalcount_coalchain"] = """
let nCalls = 0
function src(): string | null { nCalls = nCalls + 1
  return null }
function body() {
  print(src() ?? "D")
  print(nCalls)
}
body()
"""

P["u_alias_nul_bool"] = """
type B = boolean | null
function body() {
  const xs: B[] = [true, null]
  const a = xs[0]
  if a == null { print("N") } else { print(a) }
}
body()
"""

P["u_alias_nul_bool_ctl"] = """
function body() {
  const xs: (boolean | null)[] = [true, null]
  const a = xs[0]
  if a == null { print("N") } else { print(a) }
}
body()
"""

P["u_alias_nul_str_local"] = """
type NS = string | null
function body(p: NS) {
  if p != null { print(p) } else { print("N") }
}
body("a")
body(null)
"""

P["u_alias_nul_str_ctl"] = """
function body(p: string | null) {
  if p != null { print(p) } else { print("N") }
}
body("a")
body(null)
"""

P["u_method"] = """
function body() {
  const s: string = "abcd"
  print(s.length)
  print(s.slice(1, 3))
}
body()
"""

P["u_nested_narrow"] = """
function body(a: string | null, b: i32 | null) {
  if a != null {
    if b != null { print(a)
      print(b) } else { print("NB") }
  } else { print("NA") }
}
body("x", 5)
body("x", null)
body(null, 5)
"""

P["u_optchain_field"] = """
type S = { w: i32 }
function body(a: S | null) {
  if a?.w != null { print("HAS") } else { print("N") }
  const t = a?.w
  print(t ?? 0)
}
body({ w: 3 })
body(null)
"""

P["u_captured_niche_list"] = """
function body(p: string[] | null) {
  function inner() { if p != null { print(p.length) } else { print("N") } }
  inner()
}
body(["a"])
body(null)
"""

P["u_captured_niche_list_ctl"] = """
function body(p: string[] | null) {
  if p != null { print(p.length) } else { print("N") }
}
body(["a"])
body(null)
"""

P["u_map_i32_capture"] = """
function body(m: {[i32]: string}) {
  function inner() { print(m.size) }
  inner()
}
function mk(): {[i32]: string} {
  const m: {[i32]: string} = Map()
  m[1] = "x"
  return m
}
body(mk())
"""

P["u_map_str_capture"] = """
function body(m: {[string]: i32}) {
  function inner2() { print(m.size) }
  inner2()
}
function mk2(): {[string]: i32} {
  const m: {[string]: i32} = Map()
  m["k"] = 1
  return m
}
body(mk2())
"""

for name, body in P.items():
    open(os.path.join(OUT, name + ".vl"), "w").write(body.lstrip("\n"))
print("wrote", len(P))
