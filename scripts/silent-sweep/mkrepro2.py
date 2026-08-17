#!/usr/bin/env python3
"""Second repro round: pin the trigger for the cells that did not reproduce minimally."""
import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "repro2")
os.makedirs(OUT, exist_ok=True)
P = {}

# ===== E1  FORWARD-declared nullable alias used by a struct type ==============
P["E1_repro_after"] = """
type Wrap = { f: NulAlias }
type NulAlias = i32 | null
function body() {
  const w: Wrap = { f: 7 }
  const v = w.f
  if v != null { print(v) } else { print("N") }
}
body()
"""
P["E1_ctl_before"] = """
type NulAlias2 = i32 | null
type Wrap2 = { f: NulAlias2 }
function body() {
  const w: Wrap2 = { f: 7 }
  const v = w.f
  if v != null { print(v) } else { print("N") }
}
body()
"""
P["E1_after_str"] = """
type Wrap3 = { f: NulAlias3 }
type NulAlias3 = string | null
function body() {
  const w: Wrap3 = { f: "aa" }
  const v = w.f
  if v != null { print(v) } else { print("N") }
}
body()
"""
P["E1_after_nonnul"] = """
type Wrap4 = { f: PlainAlias }
type PlainAlias = i32
function body() {
  const w: Wrap4 = { f: 7 }
  print(w.f)
}
body()
"""
P["E1_after_list"] = """
type NulAlias5 = i32 | null
function body() {
  const xs: NulAlias5[] = [7, null]
  for v in xs { if v != null { print(v) } else { print("N") } }
}
body()
"""
P["E1_after_list_fwd"] = """
function body() {
  const xs: NulAlias6[] = [7, null]
  for v in xs { if v != null { print(v) } else { print("N") } }
}
type NulAlias6 = i32 | null
body()
"""
P["E1_after_struct_direct"] = """
type Wrap7 = { f: i32 | null }
function body() {
  const w: Wrap7 = { f: 7 }
  const v = w.f
  if v != null { print(v) } else { print("N") }
}
body()
"""

# ===== E2  INLINE litunion list element initialised from a CALL ===============
P["E2_repro_call"] = """
function src(): "p" | "q" { return "p" }
function body() {
  const xs: ("p" | "q")[] = [src()]
  print(xs[0])
}
body()
"""
P["E2_ctl_literal"] = """
function body() {
  const xs: ("p" | "q")[] = ["p"]
  print(xs[0])
}
body()
"""
P["E2_ctl_named_call"] = """
type K = "p" | "q"
function src2(): K { return "p" }
function body() {
  const xs: K[] = [src2()]
  print(xs[0])
}
body()
"""
P["E2_call_scalar_ctl"] = """
function src3(): string { return "p" }
function body() {
  const xs: string[] = [src3()]
  print(xs[0])
}
body()
"""
P["E2_call_nolist"] = """
function src4(): "p" | "q" { return "p" }
function body() {
  const v: "p" | "q" = src4()
  print(v)
}
body()
"""
P["E2_call_mapval"] = """
function src5(): "p" | "q" { return "p" }
function body() {
  const m: {[string]: "p" | "q"} = Map()
  m["k"] = src5()
  print(m["k"] ?? "q")
}
body()
"""

# ===== E3  the nullable scalar box under a capture: is NARROWING the trigger? =
P["E3_capture_nonarrow"] = """
function body(p: i32 | null) {
  function inner() { print(p == null) }
  inner()
}
body(7)
body(null)
"""
P["E3_capture_coal"] = """
function body(p: i32 | null) {
  function inner2() { print(p ?? 0) }
  inner2()
}
body(7)
body(null)
"""
P["E3_capture_is"] = """
function body(p: i32 | null) {
  function inner3() { if p is i32 { print(p) } else { print("N") } }
  inner3()
}
body(7)
body(null)
"""
P["E3_capture_match"] = """
function body(p: i32 | null) {
  function inner4() { match p { null => { print("N") } _ => { print(p) } } }
  inner4()
}
body(7)
body(null)
"""
P["E3_capture_plain_i32"] = """
function body(p: i32) {
  function inner5() { print(p) }
  inner5()
}
body(7)
"""
P["E3_capture_two_levels"] = """
function body(p: i32 | null) {
  function outerFn() {
    function innerFn() { if p != null { print(p) } else { print("N") } }
    innerFn()
  }
  outerFn()
}
body(7)
"""
P["E3_capture_vubox_nonarrow"] = """
function body(p: (string | i32) | null) {
  function inner6() { print(p == null) }
  inner6()
}
body(7)
"""

# ===== E4  the map for-in double-evaluation: what is the trigger? =============
P["E4_field_recv"] = """
let nCalls = 0
type Holder = { m: {[string]: i32} }
function mk(): Holder {
  nCalls = nCalls + 1
  const m: {[string]: i32} = Map()
  m["k"] = 5
  return { m: m }
}
for v in mk().m.values() { print(v) }
print(nCalls)
"""
P["E4_nested_call"] = """
let nCalls = 0
function mk2(): {[string]: i32} {
  nCalls = nCalls + 1
  const m: {[string]: i32} = Map()
  m["k"] = 5
  return m
}
function idf(m: {[string]: i32}): {[string]: i32} { return m }
for v in idf(mk2()).values() { print(v) }
print(nCalls)
"""
P["E4_i32key"] = """
let nCalls = 0
function mk3(): {[i32]: string} {
  nCalls = nCalls + 1
  const m: {[i32]: string} = Map()
  m[1] = "x"
  return m
}
for v in mk3().values() { print(v) }
print(nCalls)
"""
P["E4_keys_i32key"] = """
let nCalls = 0
function mk4(): {[i32]: string} {
  nCalls = nCalls + 1
  const m: {[i32]: string} = Map()
  m[1] = "x"
  return m
}
for v in mk4().keys() { print(v) }
print(nCalls)
"""
P["E4_set"] = """
let nCalls = 0
function mk5(): i32[] {
  nCalls = nCalls + 1
  return [5]
}
for v in mk5().slice(0, 1) { print(v) }
print(nCalls)
"""
P["E4_values_bound_global"] = """
let nCalls = 0
function mk6(): {[string]: i32} {
  nCalls = nCalls + 1
  const m: {[string]: i32} = Map()
  m["k"] = 5
  return m
}
const gm = mk6()
for v in gm.values() { print(v) }
print(nCalls)
"""

# ===== E5  narrowed-assignment reject across places ==========================
P["E5_field"] = """
type W = { f: string | null }
function body(w: W) {
  if w.f != null { print(w.f)
    w.f = null }
  print(w.f == null)
}
body({ f: "a" })
"""
P["E5_global"] = """
let gq: string | null = "a"
function body() {
  if gq != null { print(gq)
    gq = null }
  print(gq == null)
}
body()
"""
P["E5_param"] = """
function body(q: string | null) {
  if q != null { print(q)
    q = null }
  print(q == null)
}
body("a")
"""
P["E5_nested_if_else"] = """
function body(p: string | null) {
  let q: string | null = p
  if q == null { print("N") } else { print(q)
    q = null }
  print(q == null)
}
body("a")
"""
P["E5_after_narrow_block"] = """
function body(p: string | null) {
  let q: string | null = p
  if q != null { print(q) }
  if true { q = null }
  print(q == null)
}
body("a")
"""

# ===== E6  the nullable struct union ==========================================
P["E6_match"] = """
type Cat = { c: i32 }
type Dog = { d: i32 }
type Shape = Cat | Dog
function body(s: Shape | null) {
  match s {
    null => { print("N") }
    _ => { if s is Cat { print(s.c) } else { print(s.d) } }
  }
}
body({ c: 1 })
body(null)
"""
P["E6_is_direct"] = """
type Cat2 = { c: i32 }
type Dog2 = { d: i32 }
type Shape2 = Cat2 | Dog2
function body(s: Shape2 | null) {
  if s is Cat2 { print(s.c) } else { print("OTHER") }
}
body({ c: 1 })
body(null)
"""
P["E6_field_only"] = """
type Cat3 = { c: i32 }
type Dog3 = { d: i32 }
type Shape3 = Cat3 | Dog3
function body(s: Shape3 | null) {
  if s != null { print("HAS") } else { print("N") }
}
body({ c: 1 })
body(null)
"""

for name, body in P.items():
    open(os.path.join(OUT, name + ".vl"), "w").write(body.lstrip("\n"))
print("wrote", len(P))
