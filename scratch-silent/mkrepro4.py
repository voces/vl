#!/usr/bin/env python3
"""Fourth repro round: minimal hand-written forward-declaration pairs, and the widened
forward-reference surface (list element / map value / alias chain / nested struct)."""
import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "repro4")
os.makedirs(OUT, exist_ok=True)
P = {}

# ---- G1  boolean: prints 1 instead of true ---------------------------------
P["G1_repro"] = """
type Wrap = { f: Flag }
type Flag = boolean
const w: Wrap = { f: true }
print(w.f)
"""
P["G1_ctl_order"] = """
type Flag2 = boolean
type Wrap2 = { f: Flag2 }
const w: Wrap2 = { f: true }
print(w.f)
"""
P["G1_ctl_direct"] = """
type Wrap3 = { f: boolean }
const w: Wrap3 = { f: true }
print(w.f)
"""
P["G1_false"] = """
type Wrap4 = { f: Flag4 }
type Flag4 = boolean
const w: Wrap4 = { f: false }
print(w.f)
"""
P["G1_two_fields"] = """
type Wrap5 = { f: Flag5, g: i32 }
type Flag5 = boolean
const w: Wrap5 = { f: true, g: 9 }
print(w.f)
print(w.g)
"""
P["G1_eqcmp"] = """
type Wrap6 = { f: Flag6 }
type Flag6 = boolean
const w: Wrap6 = { f: true }
print(w.f == true)
if w.f { print("YES") } else { print("NO") }
"""

# ---- G2  named litunion: prints 0 instead of p -----------------------------
P["G2_repro"] = """
type K = "p" | "q"
type WrapK = { f: K2 }
type K2 = K
const w: WrapK = { f: "p" }
print(w.f)
"""
P["G2_ctl_order"] = """
type Ka = "p" | "q"
type Kb = Ka
type WrapKb = { f: Kb }
const w: WrapKb = { f: "p" }
print(w.f)
"""
P["G2_nul"] = """
type Kc = "p" | "q"
type WrapKc = { f: Kd }
type Kd = Kc | null
function body() {
  const w: WrapKc = { f: "p" }
  const v = w.f
  if v != null { print(v) } else { print("NUL") }
}
body()
"""
P["G2_direct_alias"] = """
type Ke = "p" | "q"
type WrapKe = { f: Ke }
const w: WrapKe = { f: "p" }
print(w.f)
"""
P["G2_second_member"] = """
type Kf = "p" | "q"
type WrapKf = { f: Kg2 }
type Kg2 = Kf
const w: WrapKf = { f: "q" }
print(w.f)
"""

# ---- G3  how far does the forward reference reach? -------------------------
P["G3_listelem_fwd"] = """
function body() {
  const xs: FwdA[] = [true]
  print(xs[0])
}
type FwdA = boolean
body()
"""
P["G3_mapval_fwd"] = """
function body() {
  const m: {[string]: FwdB} = Map()
  m["k"] = true
  for v in m.values() { print(v) }
}
type FwdB = boolean
body()
"""
P["G3_bare_fwd"] = """
function body() {
  const v: FwdC = true
  print(v)
}
type FwdC = boolean
body()
"""
P["G3_param_fwd"] = """
function body(v: FwdD) { print(v) }
type FwdD = boolean
body(true)
"""
P["G3_ret_fwd"] = """
function mk(): FwdE { return true }
type FwdE = boolean
print(mk())
"""
P["G3_chain_fwd"] = """
type WrapCh = { f: Ch1 }
type Ch1 = Ch2
type Ch2 = boolean
const w: WrapCh = { f: true }
print(w.f)
"""
P["G3_nested_struct_fwd"] = """
type Outer = { inner: Inner }
type Inner = { f: boolean }
const o: Outer = { inner: { f: true } }
print(o.inner.f)
"""
P["G3_struct_alias_fwd"] = """
type WrapSt = { f: StA }
type StA = { w: i32 }
const w: WrapSt = { f: { w: 5 } }
print(w.f.w)
"""
P["G3_i32_fwd"] = """
type WrapI = { f: IntA }
type IntA = i32
const w: WrapI = { f: 7 }
print(w.f)
"""
P["G3_string_fwd"] = """
type WrapS = { f: StrA }
type StrA = string
const w: WrapS = { f: "aa" }
print(w.f)
"""
P["G3_f64_fwd"] = """
type WrapF = { f: FltA }
type FltA = f64
const w: WrapF = { f: 7.25 }
print(w.f)
"""
P["G3_numlit_fwd"] = """
type Nx = 1 | 2
type WrapN = { f: NxA }
type NxA = Nx
const w: WrapN = { f: 1 }
print(w.f)
"""

# ---- G4  the double-evaluation: is the map REBUILT or just re-read? ---------
P["G4_identity"] = """
let nCalls = 0
function mk(): {[string]: i32} {
  nCalls = nCalls + 1
  const m: {[string]: i32} = Map()
  m["k"] = nCalls
  return m
}
for v in mk().values() { print(v) }
print(nCalls)
"""
P["G4_ctl_bound"] = """
let nCalls = 0
function mk2(): {[string]: i32} {
  nCalls = nCalls + 1
  const m: {[string]: i32} = Map()
  m["k"] = nCalls
  return m
}
const b = mk2()
for v in b.values() { print(v) }
print(nCalls)
"""
P["G4_two_entry"] = """
let nCalls = 0
function mk3(): {[string]: i32} {
  nCalls = nCalls + 1
  const m: {[string]: i32} = Map()
  m["a"] = 1
  m["b"] = 2
  return m
}
for v in mk3().values() { print(v) }
print(nCalls)
"""

for name, body in P.items():
    open(os.path.join(OUT, name + ".vl"), "w").write(body.lstrip("\n"))
print("wrote", len(P))
