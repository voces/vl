#!/usr/bin/env python3
"""Third repro round: fix the exact axis of each isolated defect."""
import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "repro3")
os.makedirs(OUT, exist_ok=True)
P = {}

# ===== F1  forward-declared nullable alias, across payload reps ===============
FWD = [("i32", "7", "print(v)"), ("i64", "70", "print(v)"),
       ("f64", "7.25", "print(v)"), ("f32", "7.25", "print(v)"),
       ("boolean", "true", "print(v)"), ("string", '"aa"', "print(v)"),
       ("Kk", '"p"', "print(v)"), ("Nn", "1", "print(v)"),
       ("Ss", "{ w: 5 }", "print(v.w)"), ("i32[]", "[1, 2]", "print(v.length)"),
       ("string[]", '["a"]', "print(v.length)")]
for ty, val, rd in FWD:
    tag = ty.replace("[", "L").replace("]", "")
    pre = ""
    if ty == "Kk":
        pre = 'type Kk = "p" | "q"\n'
    if ty == "Nn":
        pre = "type Nn = 1 | 2\n"
    if ty == "Ss":
        pre = "type Ss = { w: i32 }\n"
    P[f"F1_fwd_{tag}"] = f"""
{pre}type WrapF{tag} = {{ f: NulF{tag} }}
type NulF{tag} = {ty} | null
function body() {{
  const w: WrapF{tag} = {{ f: {val} }}
  const v = w.f
  if v != null {{ {rd} }} else {{ print("N") }}
}}
body()
"""
    P[f"F1_ord_{tag}"] = f"""
{pre}type NulO{tag} = {ty} | null
type WrapO{tag} = {{ f: NulO{tag} }}
function body() {{
  const w: WrapO{tag} = {{ f: {val} }}
  const v = w.f
  if v != null {{ {rd} }} else {{ print("N") }}
}}
body()
"""

# the litunion forward case reported the "not assignable to itself" message
P["F1_fwd_lit_assign"] = """
type Klit = "p" | "q"
type WrapL = { f: NulL }
type NulL = Klit | null
function body() {
  const w: WrapL = { f: "p" }
  print(w.f ?? "q")
}
body()
"""

# ===== F2  the for-in over a method call: which receivers double? =============
def evalcell(name, mkbody, loop, mkty="{[string]: i32}"):
    return f"""
let nCalls = 0
function mk(): {mkty} {{
  nCalls = nCalls + 1
{mkbody}
}}
{loop}
print(nCalls)
"""

MAPBODY = """  const m: {[string]: i32} = Map()
  m["k"] = 5
  return m"""
LISTBODY = "  return [5, 6]"
STRBODY = '  return "ab"'

P["F2_values"] = evalcell("v", MAPBODY, "for v in mk().values() { print(v) }")
P["F2_keys"] = evalcell("k", MAPBODY, "for v in mk().keys() { print(v) }")
P["F2_entries"] = evalcell("e", MAPBODY, "for v in mk().entries() { print(v) }")
P["F2_list_forin"] = evalcell("l", LISTBODY, "for v in mk() { print(v) }", "i32[]")
P["F2_list_slice"] = evalcell("s", LISTBODY, "for v in mk().slice(0, 1) { print(v) }", "i32[]")
P["F2_list_map"] = evalcell("m", LISTBODY, "for v in mk().map((z) => z) { print(v) }", "i32[]")
P["F2_list_filter"] = evalcell("f", LISTBODY, "for v in mk().filter((z) => true) { print(v) }", "i32[]")
P["F2_len_only"] = evalcell("n", MAPBODY, "print(mk().size)")
P["F2_idx_only"] = evalcell("i", MAPBODY, 'print(mk()["k"] ?? 0)')
P["F2_str_chars"] = evalcell("c", STRBODY, "print(mk().length)", "string")
P["F2_values_twice_in_body"] = evalcell(
    "t", MAPBODY, "for v in mk().values() { print(v)\n  print(v) }")
P["F2_values_nested_fn"] = """
let nCalls = 0
function mk2(): {[string]: i32} {
  nCalls = nCalls + 1
  const m: {[string]: i32} = Map()
  m["k"] = 5
  return m
}
function body() {
  for v in mk2().values() { print(v) }
}
body()
print(nCalls)
"""
P["F2_values_arg_side_effect"] = """
let log: i32[] = []
function mk3(): {[string]: i32} {
  log.push(1)
  const m: {[string]: i32} = Map()
  m["k"] = 5
  return m
}
for v in mk3().values() { print(v) }
print(log.length)
"""

# ===== F3  the nullable scalar box under a capture: which narrow forms? =======
BOXCAP = [("nenull", "if p != null { print(p) } else { print(\"N\") }"),
          ("eqnull", "if p == null { print(\"N\") } else { print(p) }"),
          ("is_t", "if p is i32 { print(p) } else { print(\"N\") }"),
          ("match", "match p { null => { print(\"N\") } _ => { print(p) } }"),
          ("coal", "print(p ?? 0)"),
          ("eqcmp", "print(p == null)"),
          ("andguard", "print(p != null && p == 7)")]
for i, (nm, code) in enumerate(BOXCAP):
    P[f"F3_cap_{nm}"] = f"""
function body(p: i32 | null) {{
  function innerC{i}() {{ {code} }}
  innerC{i}()
}}
body(7)
body(null)
"""
    P[f"F3_nocap_{nm}"] = f"""
function body(p: i32 | null) {{
  {code}
}}
body(7)
body(null)
"""

# ===== F4  is the loud floor missing only for `!= null`?  Struct/list dual ====
P["F4_cap_nulstruct"] = """
type Sf = { w: i32 }
function body(p: Sf | null) {
  function innerS() { if p != null { print(p.w) } else { print("N") } }
  innerS()
}
body({ w: 5 })
body(null)
"""
P["F4_cap_nullist"] = """
function body(p: i32[] | null) {
  function innerL() { if p != null { print(p.length) } else { print("N") } }
  innerL()
}
body([1])
body(null)
"""
P["F4_cap_nulmapstr"] = """
function body(p: {[string]: i32} | null) {
  function innerM() { if p != null { print(p.size) } else { print("N") } }
  innerM()
}
body(null)
"""
P["F4_cap_nulclosure"] = """
function body(p: ((i32) => i32) | null) {
  function innerF() { if p != null { print(p(3)) } else { print("N") } }
  innerF()
}
body(null)
"""

for name, body in P.items():
    open(os.path.join(OUT, name + ".vl"), "w").write(body.lstrip("\n"))
print("wrote", len(P))
