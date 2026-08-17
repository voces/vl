#!/usr/bin/env python3
"""Write small syntax probes, one per open question, into scratch-silent/probes/."""
import os, sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "probes")
os.makedirs(OUT, exist_ok=True)

P = {}

P["q_globalinit"] = """
let nCalls = 0
function src(): i32 { nCalls = nCalls + 1
  return 7 }
const g: string | null = "a"
const g2 = src()
function body() { print(g2) }
body()
print(nCalls)
"""

P["q_mapread"] = """
function body() {
  const m: {[string]: i32} = Map()
  m["k"] = 5
  const v = m["k"]
  print(v)
  const m2: {[i32]: string} = Map()
  m2[1] = "z"
  print(m2[1])
}
body()
"""

P["q_matchnul"] = """
function body(p: string | null) {
  match p {
    null => { print("N") }
    _ => { print(p) }
  }
}
body("a")
body(null)
"""

P["q_optchain"] = """
type S = { w: i32 }
function body(a: S | null, b: i32[] | null, c: string | null) {
  print(a?.w)
  print(b?.length)
  print(c?.length)
}
body({ w: 3 }, [1,2], "abc")
body(null, null, null)
"""

P["q_break"] = """
function body(p: string | null) {
  let q = p
  while q != null {
    print(q)
    q = null
  }
}
body("a")
body(null)
"""

P["q_printscalars"] = """
function body() {
  const a: i64 = 9
  const b: f32 = 1.5
  const c: f64 = 2.5
  print(a)
  print(b)
  print(c)
}
body()
"""

P["q_closurecall"] = """
function body(f: ((i32) => i32) | null) {
  if f != null { print(f(3)) } else { print("N") }
}
body((x) => x + 1)
body(null)
"""

P["q_isnul"] = """
type S = { w: i32 }
function bs(p: string | null) { if p is string { print(p) } else { print("N") } }
function bb(p: boolean | null) { if p is boolean { print(p) } else { print("N") } }
function bt(p: S | null) { if p is S { print(p.w) } else { print("N") } }
function bl(p: i32[] | null) { if p is i32[] { print(p.length) } else { print("N") } }
bs("a")
bs(null)
bb(true)
bb(null)
bt({ w: 4 })
bt(null)
bl([1,2])
bl(null)
"""

P["q_coalesce"] = """
type K = "p" | "q"
function body(a: string | null, b: i32 | null, c: boolean | null, d: K | null) {
  print(a ?? "D")
  print(b ?? 0)
  print(c ?? false)
  print(d ?? "q")
}
body("a", 1, true, "p")
body(null, null, null, null)
"""

P["q_forin_nul"] = """
function body() {
  const xs: (string | null)[] = ["a", null]
  for v in xs {
    if v != null { print(v) } else { print("N") }
  }
}
body()
"""

P["q_unionbox"] = """
function body(u: string | i32) {
  if u is string { print(u) } else { print(u) }
}
body("a")
body(5)
"""

P["q_structunion"] = """
type Cat = { c: i32 }
type Dog = { d: i32 }
type Shape = Cat | Dog
function body(s: Shape) {
  if s is Cat { print(s.c) } else { print(s.d) }
}
body({ c: 1 })
body({ d: 2 })
"""

P["q_matchlit"] = """
type K = "p" | "q"
function body(k: K) {
  match k {
    "p" => { print("P") }
    "q" => { print("Q") }
  }
}
body("p")
body("q")
"""

P["q_numlit"] = """
type N2 = 1 | 2
function body(n: N2) {
  match n {
    1 => { print("one") }
    2 => { print("two") }
  }
  print(n)
}
body(1)
body(2)
"""

P["q_nulniches_all"] = """
type S = { w: i32 }
function n1(p: string | null): i32 { if p != null { return p.length } else { return -1 } }
function n2(p: boolean | null): i32 { if p != null { if p { return 1 } else { return 0 } } else { return -1 } }
function n3(p: S | null): i32 { if p != null { return p.w } else { return -1 } }
function n4(p: i32[] | null): i32 { if p != null { return p.length } else { return -1 } }
function n5(p: string[] | null): i32 { if p != null { return p.length } else { return -1 } }
function n6(p: f64[] | null): i32 { if p != null { return p.length } else { return -1 } }
function n7(p: i64[] | null): i32 { if p != null { return p.length } else { return -1 } }
function n8(p: f32[] | null): i32 { if p != null { return p.length } else { return -1 } }
function n9(p: S[] | null): i32 { if p != null { return p.length } else { return -1 } }
function n10(p: ((i32) => i32) | null): i32 { if p != null { return p(3) } else { return -1 } }
function n11(p: {[string]: i32} | null): i32 { if p != null { return p["k"] } else { return -1 } }
print(n1("ab"))
print(n1(null))
print(n2(true))
print(n2(null))
print(n3({ w: 5 }))
print(n3(null))
print(n4([1,2]))
print(n4(null))
print(n5(["a"]))
print(n5(null))
print(n6([1.5]))
print(n6(null))
print(n7([1]))
print(n7(null))
print(n8([1.5]))
print(n8(null))
print(n9([{ w: 1 }]))
print(n9(null))
print(n10((x) => x + 1))
print(n10(null))
"""

P["q_maplit_init"] = """
function body() {
  const m: {[string]: i32} = Map()
  m["k"] = 5
  const n: {[string]: i32} | null = m
  if n != null { print(n["k"]) } else { print("N") }
}
body()
"""

P["q_fieldnul"] = """
type S = { w: i32 }
type W = { f: string | null }
function body(w: W) {
  const v = w.f
  if v != null { print(v) } else { print("N") }
}
body({ f: "a" })
body({ f: null })
"""

P["q_inline_lit"] = """
function body(k: "p" | "q") {
  if k == "p" { print("P") } else { print("Q") }
  print(k)
}
body("p")
body("q")
"""

P["q_f32lit"] = """
function body() {
  const a: f32 = 1.5
  const xs: f32[] = [1.5, 2.5]
  print(a)
  print(xs.length)
  print(xs[0])
}
body()
"""

for name, body in P.items():
    with open(os.path.join(OUT, name + ".vl"), "w") as fh:
        fh.write(body.lstrip("\n"))
print("wrote", len(P), "probes to", OUT)
