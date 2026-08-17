#!/usr/bin/env python3
"""Minimal reproducing programs and their working controls, one per candidate finding,
plus confirmation probes for the orchestrator's stale-queue items."""
import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "repro")
os.makedirs(OUT, exist_ok=True)
P = {}

# ============ D1  nullable numeric BOX captured by a nested function ============
P["D1_repro"] = """
function body(p: i32 | null) {
  function inner() { if p != null { print(p) } else { print("N") } }
  inner()
}
body(7)
body(null)
"""
P["D1_ctl_uncaptured"] = """
function body(p: i32 | null) {
  if p != null { print(p) } else { print("N") }
}
body(7)
body(null)
"""
P["D1_ctl_nulstr"] = """
function body(p: string | null) {
  function inner() { if p != null { print(p) } else { print("N") } }
  inner()
}
body("a")
body(null)
"""
P["D1_ctl_nulbool"] = """
function body(p: boolean | null) {
  function inner() { if p != null { print(p) } else { print("N") } }
  inner()
}
body(true)
body(null)
"""
P["D1_i64"] = P["D1_repro"].replace("i32 | null", "i64 | null").replace("body(7)", "body(70)")
P["D1_f64"] = P["D1_repro"].replace("i32 | null", "f64 | null").replace("body(7)", "body(7.25)")
P["D1_f32"] = P["D1_repro"].replace("i32 | null", "f32 | null").replace("body(7)", "body(7.25)")
P["D1_numlit"] = """
type N2 = 1 | 2
function body(p: N2 | null) {
  function inner() { if p != null { print(p) } else { print("N") } }
  inner()
}
body(1)
body(null)
"""
P["D1_vubox"] = """
function body(p: (string | i32) | null) {
  function inner() { if p != null { if p is string { print(p) } else { print(p) } } else { print("N") } }
  inner()
}
body(7)
body(null)
"""
P["D1_lambda_capture"] = """
function body(p: i32 | null) {
  const f = () => { if p != null { print(p) } else { print("N") } }
  f()
}
body(7)
body(null)
"""

# ============ D2  `for v in mk().values()` evaluates mk() twice =================
P["D2_repro"] = """
let nCalls = 0
function mk(): {[string]: i32} {
  nCalls = nCalls + 1
  const m: {[string]: i32} = Map()
  m["k"] = 5
  return m
}
for v in mk().values() { print(v) }
print(nCalls)
"""
P["D2_ctl_bound"] = """
let nCalls = 0
function mk(): {[string]: i32} {
  nCalls = nCalls + 1
  const m: {[string]: i32} = Map()
  m["k"] = 5
  return m
}
const m2 = mk()
for v in m2.values() { print(v) }
print(nCalls)
"""
P["D2_ctl_list"] = """
let nCalls = 0
function mk(): i32[] {
  nCalls = nCalls + 1
  return [5]
}
for v in mk() { print(v) }
print(nCalls)
"""
P["D2_keys"] = """
let nCalls = 0
function mk(): {[string]: i32} {
  nCalls = nCalls + 1
  const m: {[string]: i32} = Map()
  m["k"] = 5
  return m
}
for v in mk().keys() { print(v) }
print(nCalls)
"""
P["D2_size"] = """
let nCalls = 0
function mk(): {[string]: i32} {
  nCalls = nCalls + 1
  const m: {[string]: i32} = Map()
  m["k"] = 5
  return m
}
print(mk().size)
print(nCalls)
"""
P["D2_mapfilter"] = """
let nCalls = 0
function mk(): i32[] {
  nCalls = nCalls + 1
  return [5, 6]
}
print(mk().map((z) => z).length)
print(nCalls)
"""
P["D2_slice"] = """
let nCalls = 0
function mk(): i32[] {
  nCalls = nCalls + 1
  return [5, 6]
}
print(mk().slice(0, 1).length)
print(nCalls)
"""

# ============ D3  numeric-litunion map value, index read narrowed ===============
P["D3_repro"] = """
type N2 = 1 | 2
function body() {
  const m: {[string]: N2} = Map()
  m["k"] = 1
  const v = m["k"]
  if v != null { print(v) } else { print("N") }
}
body()
"""
P["D3_ctl_named"] = """
type K = "p" | "q"
function body() {
  const m: {[string]: K} = Map()
  m["k"] = "p"
  const v = m["k"]
  if v != null { print(v) } else { print("N") }
}
body()
"""
P["D3_ctl_declnul"] = """
type N2 = 1 | 2
function body() {
  const m: {[string]: N2 | null} = Map()
  m["k"] = 1
  const v = m["k"]
  if v != null { print(v) } else { print("N") }
}
body()
"""

# ============ D4  `xs[0] ?? d` over a nullable-element list ====================
P["D4_repro"] = """
function body() {
  const xs: (string | null)[] = ["aa", null]
  print(xs[0] ?? "DD")
  print(xs[1] ?? "DD")
}
body()
"""
P["D4_ctl_narrow"] = """
function body() {
  const xs: (string | null)[] = ["aa", null]
  const a = xs[0]
  print(a ?? "DD")
  const b = xs[1]
  print(b ?? "DD")
}
body()
"""
P["D4_ctl_mapidx"] = """
function body() {
  const m: {[string]: string} = Map()
  m["k"] = "aa"
  print(m["k"] ?? "DD")
  print(m["zz"] ?? "DD")
}
body()
"""

# ============ D5  narrowed nullable map, iterate values ========================
P["D5_repro"] = """
function mk(): {[string]: i32} | null {
  const m: {[string]: i32} = Map()
  m["k"] = 5
  return m
}
function body() {
  const v: {[string]: i32} | null = mk()
  if v != null { for z in v.values() { print(z) } } else { print("N") }
}
body()
"""
P["D5_ctl_nonnull"] = """
function mk(): {[string]: i32} {
  const m: {[string]: i32} = Map()
  m["k"] = 5
  return m
}
function body() {
  const v: {[string]: i32} = mk()
  for z in v.values() { print(z) }
}
body()
"""
P["D5_ctl_size"] = """
function mk(): {[string]: i32} | null {
  const m: {[string]: i32} = Map()
  m["k"] = 5
  return m
}
function body() {
  const v: {[string]: i32} | null = mk()
  if v != null { print(v.size) } else { print("N") }
}
body()
"""
P["D5_keys"] = """
function mk(): {[string]: i32} | null {
  const m: {[string]: i32} = Map()
  m["k"] = 5
  return m
}
function body() {
  const v: {[string]: i32} | null = mk()
  if v != null { for z in v.keys() { print(z) } } else { print("N") }
}
body()
"""

# ============ D6  i32-keyed map captured by a nested function ==================
P["D6_repro"] = """
function mk(): {[i32]: string} {
  const m: {[i32]: string} = Map()
  m[1] = "x"
  return m
}
function body(m: {[i32]: string}) {
  function inner() { print(m.size) }
  inner()
}
body(mk())
"""
P["D6_ctl_strkey"] = """
function mk2(): {[string]: i32} {
  const m: {[string]: i32} = Map()
  m["k"] = 1
  return m
}
function body(m: {[string]: i32}) {
  function inner2() { print(m.size) }
  inner2()
}
body(mk2())
"""
P["D6_ctl_uncaptured"] = """
function mk3(): {[i32]: string} {
  const m: {[i32]: string} = Map()
  m[1] = "x"
  return m
}
function body(m: {[i32]: string}) {
  print(m.size)
}
body(mk3())
"""
P["D6_local"] = """
function body() {
  const m: {[i32]: string} = Map()
  m[1] = "x"
  function inner4() { print(m.size) }
  inner4()
}
body()
"""

# ============ D7  a nullable-alias struct field is not assignable to itself ====
P["D7_repro"] = """
type K = "p" | "q"
type NulK = K | null
type Wrap = { f: NulK }
function body() {
  const w: Wrap = { f: "p" }
  const v = w.f
  if v != null { print(v) } else { print("N") }
}
body()
"""
P["D7_ctl_inline"] = """
type K = "p" | "q"
type Wrap2 = { f: K | null }
function body() {
  const w: Wrap2 = { f: "p" }
  const v = w.f
  if v != null { print(v) } else { print("N") }
}
body()
"""
P["D7_i32"] = """
type NulI = i32 | null
type Wrap3 = { f: NulI }
function body() {
  const w: Wrap3 = { f: 7 }
  const v = w.f
  if v != null { print(v) } else { print("N") }
}
body()
"""
P["D7_str"] = """
type NulS = string | null
type Wrap4 = { f: NulS }
function body() {
  const w: Wrap4 = { f: "aa" }
  const v = w.f
  if v != null { print(v) } else { print("N") }
}
body()
"""
P["D7_elem"] = """
type NulS2 = string | null
function body() {
  const xs: NulS2[] = ["aa", null]
  for v in xs { if v != null { print(v) } else { print("N") } }
}
body()
"""

# ============ D8  a nullable-CLOSURE alias folds `| null` into the result ======
P["D8_repro"] = """
type F = ((i32) => i32) | null
function src(): F { return null }
print(src() == null)
"""
P["D8_ctl_inline"] = """
function src2(): ((i32) => i32) | null { return null }
print(src2() == null)
"""
P["D8_render"] = """
type F2 = ((i32) => i32) | null
function body(f: F2) {
  if f != null { print(f(3)) } else { print("N") }
}
body((x) => x + 1)
"""
P["D8_ctl_render_inline"] = """
function body2(f: ((i32) => i32) | null) {
  if f != null { print(f(3)) } else { print("N") }
}
body2((x) => x + 1)
body2(null)
"""

# ============ D9  assigning null inside a narrowed block =======================
P["D9_repro"] = """
function body(p: string | null) {
  let q: string | null = p
  if q != null { print(q)
    q = null }
  print(q == null)
}
body("a")
"""
P["D9_ctl_outside"] = """
function body(p: string | null) {
  let q: string | null = p
  if q != null { print(q) }
  q = null
  print(q == null)
}
body("a")
"""
P["D9_while"] = """
function body(p: string | null) {
  let q: string | null = p
  while q != null {
    print(q)
    q = null
  }
  print("done")
}
body("a")
"""
P["D9_i32"] = """
function body(p: i32 | null) {
  let q: i32 | null = p
  if q != null { print(q)
    q = null }
  print(q == null)
}
body(7)
"""
P["D9_reassign_other"] = """
function body(p: string | null) {
  let q: string | null = p
  if q != null { print(q)
    q = "zz" }
  print(q == null)
}
body("a")
"""

# ============ D10  optional chain bound to a const =============================
P["D10_repro"] = """
type S = { w: i32 }
function body(a: S | null) {
  const t = a?.w
  print(t ?? 0)
}
body({ w: 3 })
body(null)
"""
P["D10_ctl_narrow"] = """
type S2 = { w: i32 }
function body(a: S2 | null) {
  if a != null { print(a.w) } else { print(0) }
}
body({ w: 3 })
body(null)
"""
P["D10_ctl_intest"] = """
type S3 = { w: i32 }
function body(a: S3 | null) {
  if a?.w != null { print("HAS") } else { print("N") }
}
body({ w: 3 })
body(null)
"""
P["D10_direct_coal"] = """
type S4 = { w: i32 }
function body(a: S4 | null) {
  print(a?.w ?? 0)
}
body({ w: 3 })
body(null)
"""

# ============ D11  numeric-valued map, index read narrowed =====================
P["D11_repro"] = """
function body() {
  const m: {[string]: i32} = Map()
  m["k"] = 5
  const v = m["k"]
  if v != null { print(v) } else { print("N") }
}
body()
"""
P["D11_ctl_bool"] = """
function body() {
  const m: {[string]: boolean} = Map()
  m["k"] = true
  const v = m["k"]
  if v != null { print(v) } else { print("N") }
}
body()
"""
P["D11_ctl_coal"] = """
function body() {
  const m: {[string]: i32} = Map()
  m["k"] = 5
  print(m["k"] ?? 0)
}
body()
"""
P["D11_ctl_declnul"] = """
function body() {
  const m: {[string]: i32 | null} = Map()
  m["k"] = 5
  const v = m["k"]
  if v != null { print(v) } else { print("N") }
}
body()
"""

# ============ D12  nullable-niche list captured by a nested function ===========
P["D12_repro"] = """
function body(p: string[] | null) {
  function inner() { if p != null { print(p.length) } else { print("N") } }
  inner()
}
body(["a"])
body(null)
"""
P["D12_ctl_i32list"] = """
function body(p: i32[] | null) {
  function inner2() { if p != null { print(p.length) } else { print("N") } }
  inner2()
}
body([1])
body(null)
"""
P["D12_ctl_uncaptured"] = """
function body(p: string[] | null) {
  if p != null { print(p.length) } else { print("N") }
}
body(["a"])
body(null)
"""
P["D12_f64list"] = P["D12_repro"].replace("string[]", "f64[]").replace('body(["a"])', "body([1.25])")
P["D12_i64list"] = P["D12_repro"].replace("string[]", "i64[]").replace('body(["a"])', "body([10])")
P["D12_reflist"] = """
type S5 = { w: i32 }
function body(p: S5[] | null) {
  function inner3() { if p != null { print(p.length) } else { print("N") } }
  inner3()
}
body([{ w: 1 }])
body(null)
"""
P["D12_map"] = """
function body(p: {[string]: i32} | null) {
  function inner5() { if p != null { print(p.size) } else { print("N") } }
  inner5()
}
body(null)
"""

# ============ D13  an INLINE litunion as a list element / map value ============
P["D13_repro_elem"] = """
function body() {
  const xs: ("p" | "q")[] = ["p", "q"]
  for v in xs { print(v) }
}
body()
"""
P["D13_ctl_named_elem"] = """
type K2 = "p" | "q"
function body() {
  const xs: K2[] = ["p", "q"]
  for v in xs { print(v) }
}
body()
"""
P["D13_repro_mapval"] = """
function body() {
  const m: {[string]: "p" | "q"} = Map()
  m["k"] = "p"
  for v in m.values() { print(v) }
}
body()
"""
P["D13_ctl_named_mapval"] = """
type K3 = "p" | "q"
function body() {
  const m: {[string]: K3} = Map()
  m["k"] = "p"
  for v in m.values() { print(v) }
}
body()
"""
P["D13_repro_idx"] = """
function body() {
  const xs: ("p" | "q")[] = ["p", "q"]
  print(xs[0])
}
body()
"""

# ============ D14  R2: f32[] | null ===========================================
P["D14_repro"] = """
function mk(): f32[] | null { return [1.25] }
function body() {
  const w: f32[] | null = mk()
  if w != null { print(w.length) } else { print("N") }
}
body()
"""
P["D14_ctl_f64"] = """
function mk2(): f64[] | null { return [1.25] }
function body() {
  const w: f64[] | null = mk2()
  if w != null { print(w.length) } else { print("N") }
}
body()
"""
P["D14_ctl_nonnull"] = """
function mk3(): f32[] { return [1.25] }
function body() {
  const w: f32[] = mk3()
  print(w.length)
}
body()
"""

# ============ D15  nullable struct union ======================================
P["D15_repro"] = """
type Cat = { c: i32 }
type Dog = { d: i32 }
type Shape = Cat | Dog
function body(s: Shape | null) {
  if s != null { if s is Cat { print(s.c) } else { print(s.d) } } else { print("N") }
}
body({ c: 1 })
body(null)
"""
P["D15_ctl_nonnull"] = """
type Cat2 = { c: i32 }
type Dog2 = { d: i32 }
type Shape2 = Cat2 | Dog2
function body(s: Shape2) {
  if s is Cat2 { print(s.c) } else { print(s.d) }
}
body({ c: 1 })
body({ d: 2 })
"""

# ============ D16  `??` on a NON-nullable ====================================
P["D16_repro"] = """
function mk(): i32 { return 7 }
print(mk() ?? 0)
"""
P["D16_ctl_nullable"] = """
function mk2(): i32 | null { return 7 }
print(mk2() ?? 0)
"""

# ============ STALE-QUEUE CONFIRMATIONS ======================================
P["Z1_box_forin_loopvar"] = """
function body() {
  const xs: (string | i32)[] = ["aa", 7]
  for v in xs { if v is string { print(v) } else { print(v) } }
}
body()
"""
P["Z2_numlit_nul_nenull"] = """
type N3 = 1 | 2
function body(p: N3 | null) {
  if p != null { print(p) } else { print("N") }
}
body(1)
body(2)
body(null)
"""
P["Z3_mapfilter_nullists"] = """
function body(a: i32[] | null, b: boolean | null, c: f64 | null) {
  if a != null { print(a.map((z) => z + 1).length) } else { print("N") }
  if a != null { print(a.filter((z) => z > 0).length) } else { print("N") }
  if b != null { print(b) } else { print("N") }
  if c != null { print(c) } else { print("N") }
}
body([1, 2], true, 1.25)
body(null, null, null)
"""
P["Z4_litunion_atom_capture"] = """
type K4 = "p" | "q"
function body(k: K4) {
  function inner6() { print(k) }
  inner6()
}
body("p")
body("q")
"""
P["Z5_let_nulinit_reassign_null"] = """
function body() {
  let p: string | null = null
  print(p == null)
  p = "aa"
  if p != null { print(p) } else { print("N") }
  p = null
  print(p == null)
}
body()
"""
P["Z6_mapkeys_boolvals"] = """
function body() {
  const m: {[string]: boolean | null} = Map()
  m["k"] = true
  m["j"] = null
  for k in m.keys() { print(k) }
  const m2: {[string]: i32 | null} = Map()
  m2["a"] = 1
  for k in m2.keys() { print(k) }
}
body()
"""
P["Z7_mapval_is_and_nenull"] = """
type K5 = "p" | "q"
function body() {
  const m: {[string]: K5 | null} = Map()
  m["k"] = "p"
  const v = m["k"]
  if v is K5 { print(v) } else { print("N") }
  const w = m["k"]
  if w != null { print(w) } else { print("N") }
}
body()
"""
P["Z8_member_union_f32_bool"] = """
type MU = { a: f32, b: boolean }
function exprIsF32(m: MU): boolean { return m.a > 1.0 }
function exprIsBool(m: MU): boolean { return m.b }
const m: MU = { a: 2.5, b: true }
print(exprIsF32(m))
print(exprIsBool(m))
"""
P["Z9_R1_audit_repro"] = """
type B = boolean | null
const xs: B[] = [true, null]
const a = xs[0]
if a == null { print("N") } else { print(a) }
"""

for name, body in P.items():
    open(os.path.join(OUT, name + ".vl"), "w").write(body.lstrip("\n"))
print("wrote", len(P))
