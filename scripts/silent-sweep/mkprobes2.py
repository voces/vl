#!/usr/bin/env python3
import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "probes2")
os.makedirs(OUT, exist_ok=True)
P = {}

# Candidate defect: un-annotated `let` from a nullable source loses the `| null`.
P["r_letinfer"] = """
function body(p: string | null) {
  let q = p
  if q != null { print(q) } else { print("N") }
  q = "z"
  print(q)
}
body("a")
body(null)
"""

P["r_letinfer_ann"] = """
function body(p: string | null) {
  let q: string | null = p
  if q != null { print(q) } else { print("N") }
  q = null
  if q != null { print(q) } else { print("N2") }
}
body("a")
body(null)
"""

P["r_constinfer"] = """
function body(p: string | null) {
  const q = p
  if q != null { print(q) } else { print("N") }
}
body("a")
body(null)
"""

P["r_printnul"] = """
type S = { w: i32 }
type K = "p" | "q"
function bs(p: string | null) { print(p) }
function bb(p: boolean | null) { print(p) }
function bk(p: K | null) { print(p) }
bs("a")
bs(null)
bb(true)
bb(null)
bk("p")
bk(null)
"""

P["r_mapvalnarrow"] = """
function body() {
  const m: {[string]: i32} = Map()
  m["k"] = 5
  const v = m["k"]
  if v != null { print(v) } else { print("N") }
  const w = m["zz"]
  if w != null { print(w) } else { print("N") }
}
body()
"""

P["r_optchain_wrap"] = """
type S = { w: i32 }
function body(a: S | null) {
  const t = a?.w
  if t != null { print(t) } else { print("N") }
}
body({ w: 3 })
body(null)
"""

P["r_numlit_eq"] = """
type N2 = 1 | 2
function body(n: N2) {
  if n == 1 { print("one") } else { print("two") }
  print(n)
}
body(1)
body(2)
"""

P["r_while_break"] = """
function body(p: string | null) {
  let q: string | null = p
  while q != null {
    print(q)
    q = null
  }
  print("done")
}
body("a")
body(null)
"""

P["r_mapnul_all"] = """
function n11(p: {[string]: i32} | null): i32 {
  if p != null {
    const v = p["k"]
    if v != null { return v } else { return -2 }
  }
  return -1
}
const m: {[string]: i32} = Map()
m["k"] = 5
print(n11(m))
print(n11(null))
"""

P["r_capture"] = """
function body(p: string | null) {
  function inner() { if p != null { print(p) } else { print("N") } }
  inner()
}
body("a")
body(null)
"""

P["r_elemnul"] = """
type S = { w: i32 }
function body() {
  const xs: (S | null)[] = [{ w: 1 }, null]
  for v in xs { if v != null { print(v.w) } else { print("N") } }
  const ys: (i32[] | null)[] = [[1,2], null]
  for v in ys { if v != null { print(v.length) } else { print("N") } }
}
body()
"""

P["r_globalnul"] = """
let nCalls = 0
function src(): string | null { nCalls = nCalls + 1
  return "a" }
const g: string | null = src()
function body() { if g != null { print(g) } else { print("N") } }
body()
print(nCalls)
"""

P["r_retunann"] = """
let nCalls = 0
function mk(): string | null { nCalls = nCalls + 1
  return "a" }
function body() {
  const v = mk()
  if v != null { print(v) } else { print("N") }
}
body()
print(nCalls)
"""

P["r_directcall"] = """
let nCalls = 0
function mk(): i32 { nCalls = nCalls + 1
  return 3 }
function body() { print(mk() + 1) }
body()
print(nCalls)
"""

P["r_boxeq"] = """
function body(u: string | i32) {
  print(u == "a")
  print(u == 5)
}
body("a")
body(5)
"""

P["r_matchbox"] = """
function body(u: string | i32) {
  match u {
    string => { print(u) }
    i32 => { print(u) }
  }
}
body("a")
body(5)
"""

P["r_matchsu"] = """
type Cat = { c: i32 }
type Dog = { d: i32 }
type Shape = Cat | Dog
function body(s: Shape) {
  match s {
    Cat => { print(s.c) }
    Dog => { print(s.d) }
  }
}
body({ c: 1 })
body({ d: 2 })
"""

P["r_fieldpos"] = """
type W = { f: string | null }
let nCalls = 0
function src(): string | null { nCalls = nCalls + 1
  return "a" }
function body() {
  const w: W = { f: src() }
  const v = w.f
  if v != null { print(v) } else { print("N") }
}
body()
print(nCalls)
"""

P["r_mapvalpos"] = """
let nCalls = 0
function src(): string | null { nCalls = nCalls + 1
  return "a" }
function body() {
  const m: {[string]: string | null} = Map()
  m["k"] = src()
  const v = m["k"]
  if v != null { print(v) } else { print("N") }
}
body()
print(nCalls)
"""

P["r_lenlist"] = """
function body() {
  const a: string[] = ["x", "y"]
  const b: f64[] = [1.5]
  const c: i64[] = [1, 2, 3]
  const d: f32[] = [1.5]
  type S = { w: i32 }
  print(a.length)
  print(b.length)
  print(c.length)
  print(d.length)
}
body()
"""

P["r_reflist"] = """
type S = { w: i32 }
function body() {
  const e: S[] = [{ w: 1 }]
  print(e.length)
  print(e[0].w)
}
body()
"""

for name, body in P.items():
    open(os.path.join(OUT, name + ".vl"), "w").write(body.lstrip("\n"))
print("wrote", len(P))
