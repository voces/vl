#!/usr/bin/env python3
"""Hazard probes for flow narrowing's `if` join (D3285): calls that may write, aliases, closures,
loops, chains, nested joins, value-position `if`s and later wider writes. Each program must be
refused (unsafe) or run printing exactly its expected output.

usage: join-hazards.py <seed.wasm> <outdir>
"""
import os, subprocess, sys
W = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VL = W + "/scripts/vl-host/target/release/vl"
seed = os.path.abspath(sys.argv[1])
out = os.path.abspath(sys.argv[2])
os.makedirs(out, exist_ok=True)

PRE = """function nn(v: i32): i32 | null {
  if v < 0 { return null }
  return v
}
type B = { v: i32 | null }
"""

# (name, program, expectation) — expectation: "refuse" or the exact stdout.
P = []
def add(name, body, want):
    P.append((name, PRE + body, want))

# D2390: a call that may write the place after the join ends the join's narrowing.
add("call_after_join", """function f(k: i32): i32 {
  let x = nn(k)
  const clr = () => { x = null }
  if x == null { x = 0 }
  clr()
  return x + 1
}
print(f(3))
""", "refuse")
# the same, the call inside the arm AFTER the write
add("call_in_arm_after_write", """function f(k: i32): i32 {
  let x = nn(k)
  const clr = () => { x = null }
  if x == null { x = 0; clr() }
  return x + 1
}
print(f(-1))
""", "refuse")
# the call before the write in the arm: the write wins
add("call_in_arm_before_write", """function f(k: i32): i32 {
  let x = nn(k)
  const clr = () => { x = null }
  if x == null { clr(); x = 0 }
  return x + 1
}
print(f(-1))
print(f(4))
""", "1\n5")
# a later write of a wider value
add("wider_write_after", """function f(k: i32, j: i32): i32 {
  let x = nn(k)
  if x == null { x = 0 }
  x = nn(j)
  return x + 1
}
print(f(3, -1))
""", "refuse")
add("wider_write_after_then_test", """function f(k: i32, j: i32): i32 {
  let x = nn(k)
  if x == null { x = 0 }
  x = nn(j)
  if x == null { x = 9 }
  return x + 1
}
print(f(3, -1))
print(f(3, 2))
""", "10\n3")
# write in one branch only, no fact
add("one_branch_write", """function f(k: i32, c: boolean): i32 {
  let x = nn(k)
  if c { x = 0 }
  return x + 1
}
print(f(-1, false))
""", "refuse")
# nested joins
add("nested_join", """function f(k: i32, c: boolean): i32 {
  let x = nn(k)
  if x == null {
    if c { x = 1 } else { x = 2 }
  }
  return x + 1
}
print(f(-1, true))
print(f(-1, false))
print(f(5, true))
""", "2\n3\n6")
add("nested_join_partial", """function f(k: i32, c: boolean): i32 {
  let x = nn(k)
  if x == null {
    if c { x = 1 }
  }
  return x + 1
}
print(f(-1, false))
""", "refuse")
add("nested_inner_guard", """function f(k: i32, c: boolean): i32 {
  let x = nn(k)
  if c {
    if x == null { x = 0 }
  }
  return x + 1
}
print(f(-1, false))
""", "refuse")
add("nested_inner_guard_use_inside", """function f(k: i32, c: boolean): i32 {
  let x = nn(k)
  let r = 0
  if c {
    if x == null { x = 0 }
    r = x + 1
  }
  return r
}
print(f(-1, true))
print(f(4, true))
print(f(4, false))
""", "1\n5\n0")
# else-if chains
add("chain", """function f(k: i32, c: boolean): i32 {
  let x = nn(k)
  if c { x = 1 } else if x == null { x = 2 }
  return x + 1
}
print(f(-1, true))
print(f(-1, false))
print(f(7, false))
""", "2\n3\n8")
add("chain_leaky", """function f(k: i32, c: boolean, d: boolean): i32 {
  let x = nn(k)
  if c { x = 1 } else if d { x = 2 }
  return x + 1
}
print(f(-1, false, false))
""", "refuse")
add("chain_else", """function f(k: i32, c: boolean, d: boolean): i32 {
  let x = nn(k)
  if c { x = 1 } else if d { x = 2 } else if x == null { x = 3 } else { }
  return x + 1
}
print(f(-1, false, false))
print(f(-1, true, false))
print(f(-1, false, true))
print(f(8, false, false))
""", "4\n2\n3\n9")
# loop around the join: body may not run
add("loop_body_join", """function f(k: i32, n: i32): i32 {
  let x = nn(k)
  let i = 0
  while i < n {
    if x == null { x = 0 }
    i = i + 1
  }
  return x + 1
}
print(f(-1, 0))
""", "refuse")
add("loop_body_join_use_inside", """function f(k: i32, n: i32): i32 {
  let x = nn(k)
  let i = 0
  let s = 0
  while i < n {
    if x == null { x = 0 }
    s = s + x + 1
    i = i + 1
  }
  return s
}
print(f(-1, 2))
print(f(3, 2))
""", "2\n8")
# value-position if
add("value_if", """function f(k: i32): i32 {
  let x = nn(k)
  const y = if x == null { x = 0; 10 } else { 20 }
  return x + y
}
print(f(-1))
print(f(4))
""", "10\n24")
add("value_if_assign", """function f(k: i32): i32 {
  let x = nn(k)
  let y = 0
  y = if x == null { x = 1; 10 } else { 20 }
  return x + y
}
print(f(-1))
print(f(4))
""", "11\n24")
add("value_if_short_circuit", """function f(k: i32, c: boolean): i32 {
  let x = nn(k)
  const y = c && (if x == null { x = 0; true } else { false })
  return x + 1
}
print(f(-1, false))
""", "refuse")
add("value_if_in_call_arg", """function id(b: i32): i32 { return b }
function f(k: i32): i32 {
  let x = nn(k)
  const y = id(if x == null { x = 0; 1 } else { 2 })
  return x + y
}
print(f(-1))
""", "refuse")
add("value_if_captured", """function f(k: i32): i32 {
  let x = nn(k)
  const clr = () => { x = null }
  const y = if x == null { x = 3; 10 } else { 20 }
  return x + y
}
print(f(-1))
print(f(4))
""", "13\n24")
add("value_if_lambda_body", """function f(k: i32): i32 {
  let x = nn(k)
  const g = (): i32 => if x == null { x = 0; 1 } else { 2 }
  return x + g()
}
print(f(-1))
""", "refuse")
add("value_if_shadow_let", """function f(k: i32): i32 {
  let x = nn(k)
  if true {
    const x2 = if x == null { x = 0; 5 } else { 6 }
    return x + x2
  }
  return 0
}
print(f(-1))
print(f(1))
""", "5\n7")
add("value_if_same_stmt", """function f(k: i32): i32 {
  let x = nn(k)
  return (if x == null { x = 0; 10 } else { 20 }) + x
}
print(f(-1))
print(f(4))
""", "refuse")
# fields
add("field_join", """function f(b: B): i32 {
  if b.v == null { b.v = 0 }
  return b.v + 1
}
print(f({ v: nn(-1) }))
print(f({ v: nn(6) }))
""", "1\n7")
add("field_alias_write", """function f(b: B): i32 {
  const q = b
  if b.v == null { b.v = 0 }
  q.v = null
  return b.v + 1
}
print(f({ v: nn(-1) }))
""", "refuse")
add("field_alias_write_in_arm", """function f(b: B): i32 {
  const q = b
  if b.v == null { b.v = 0; q.v = null }
  return b.v + 1
}
print(f({ v: nn(-1) }))
""", "refuse")
add("field_call_writes", """function clr(b: B) { b.v = null }
function f(b: B): i32 {
  if b.v == null { b.v = 0 }
  clr(b)
  return b.v + 1
}
print(f({ v: nn(-1) }))
""", "refuse")
add("field_call_writes_in_arm", """function clr(b: B) { b.v = null }
function f(b: B): i32 {
  if b.v == null { b.v = 0; clr(b) }
  return b.v + 1
}
print(f({ v: nn(-1) }))
""", "refuse")
add("field_receiver_rebind", """function f(b0: B, b1: B, c: boolean): i32 {
  let b = b0
  if b.v == null { b.v = 0 }
  if c { b = b1 }
  return b.v + 1
}
print(f({ v: nn(-1) }, { v: nn(-1) }, true))
""", "refuse")
# elements
add("elem_join", """function f(xs: (i32 | null)[]): i32 {
  if xs[0] == null { xs[0] = 0 }
  return xs[0] + 1
}
print(f([nn(-1)]))
print(f([nn(2)]))
""", "1\n3")
add("elem_var_write_in_arm", """function f(xs: (i32 | null)[], i: i32): i32 {
  if xs[0] == null { xs[0] = 0; xs[i] = null }
  return xs[0] + 1
}
print(f([nn(-1)], 0))
""", "refuse")
add("elem_var_write_other_arm", """function f(xs: (i32 | null)[], i: i32, c: boolean): i32 {
  if c { xs[0] = 1; xs[i] = null } else { xs[0] = 2 }
  return xs[0] + 1
}
print(f([nn(-1)], 0, true))
""", "refuse")
add("elem_alias_list", """function f(xs: (i32 | null)[]): i32 {
  const ys = xs
  if xs[0] == null { xs[0] = 0 }
  ys[0] = null
  return xs[0] + 1
}
print(f([nn(-1)]))
""", "refuse")
add("elem_push_pop", """function f(xs: (i32 | null)[]): i32 {
  if xs[0] == null { xs[0] = 0 }
  xs.pop()
  xs.push(null)
  return xs[0] + 1
}
print(f([nn(-1)]))
""", "refuse")
# global
add("global_join", """let g: i32 | null = null
function f(k: i32): i32 {
  g = nn(k)
  if g == null { g = 0 }
  return g + 1
}
print(f(-1))
print(f(3))
""", "1\n4")
add("global_call_writes", """let g: i32 | null = null
function clr() { g = null }
function f(k: i32): i32 {
  g = nn(k)
  if g == null { g = 0 }
  clr()
  return g + 1
}
print(f(-1))
""", "refuse")
# closures capturing the narrowed name after the join
add("closure_capture_escape", """function f(k: i32): () => i32 {
  let x = nn(k)
  if x == null { x = 0 }
  const r = () => x + 1
  x = null
  return r
}
print(f(-1)())
""", "refuse")
add("closure_capture_local", """function f(k: i32): i32 {
  let x = nn(k)
  if x == null { x = 0 }
  const r = () => x + 1
  return r()
}
print(f(-1))
print(f(2))
""", "1\n3")
# is-tests over a union
add("is_join", """function mk(k: i32): i32 | string {
  if k < 0 { return "s" }
  return k
}
function f(k: i32): i32 {
  let v = mk(k)
  if v is string { v = 0 }
  return v + 1
}
print(f(-1))
print(f(5))
""", "1\n6")
add("is_join_leaky", """function mk(k: i32): i32 | string {
  if k < 0 { return "s" }
  return k
}
function f(k: i32, c: boolean): i32 {
  let v = mk(k)
  if v is string { if c { v = 0 } }
  return v + 1
}
print(f(-1, false))
""", "refuse")
add("is_join_nullable_union", """function mk(k: i32): i32 | string | null {
  if k < 0 { return null }
  if k == 0 { return "z" }
  return k
}
function f(k: i32): i32 {
  let v = mk(k)
  if v == null { v = 1 } else if v is string { v = 2 }
  return v + 1
}
print(f(-1))
print(f(0))
print(f(5))
""", "2\n3\n6")
# a struct nullable, member read
add("struct_member", """type O = { n: i32 }
function no(k: i32): O | null {
  if k < 0 { return null }
  return { n: k }
}
function f(k: i32): i32 {
  let o = no(k)
  if o == null { o = { n: 0 } }
  return o.n + 1
}
print(f(-1))
print(f(4))
""", "1\n5")
# pass to a non-null param
add("pass_nonnull", """function need(v: i32): i32 { return v * 2 }
function f(k: i32): i32 {
  let x = nn(k)
  if x != null { } else { x = 5 }
  return need(x)
}
print(f(-1))
print(f(4))
""", "10\n8")
# the early exit still works
add("early_exit", """function f(k: i32): i32 {
  let x = nn(k)
  if x == null { return 0 }
  return x + 1
}
print(f(-1))
print(f(4))
""", "0\n5")
add("early_exit_else_write", """function f(k: i32, c: boolean): i32 {
  let x = nn(k)
  if x == null { return 0 } else if c { x = 9 }
  return x + 1
}
print(f(-1, true))
print(f(4, true))
print(f(4, false))
""", "0\n10\n5")
# write in the condition
add("cond_write", """function f(k: i32, j: i32): i32 {
  let x = nn(k)
  if x == null { x = 0 }
  if (x = nn(j)) == null { }
  return x + 1
}
print(f(3, -1))
""", "refuse")
# i32 | f64 member widening join (D2627 shape)
add("numeric_members", """function mk(k: i32): i32 | f64 | null {
  if k < 0 { return null }
  if k == 0 { return 1.5 }
  return k
}
function f(k: i32): string {
  let v = mk(k)
  if v == null { v = 2 }
  return "\\{v}"
}
print(f(-1))
print(f(0))
print(f(3))
""", "2\n1.5\n3")
# shadowing: a join on a name must not reach an inner binding of the same name, nor an inner
# binding's writes reach the outer join (keyed by the binding, not the name)
add("shadow_block_let", """function f(k: i32): i32 {
  let x = nn(k)
  if x == null { x = 2 }
  {
    let x: i32 | null = null
    print(x ?? 77)
  }
  return x + 1
}
print(f(-1))
print(f(4))
""", "77\n3\n77\n5")
add("shadow_loop_let", """function f(k: i32): i32 {
  let x = nn(k)
  if x == null { x = 2 }
  let i = 0
  while i < 2 {
    let x: i32 | null = null
    print(x ?? 77)
    i = i + 1
  }
  return x + 1
}
print(f(-1))
""", "77\n77\n3")
add("shadow_inner_write_not_outer", """function f(k: i32, c: boolean): i32 {
  let x = nn(k)
  if c {
    let x: i32 | null = null
    x = 5
    print(x + 1)
  } else {
    x = 5
  }
  return x + 1
}
print(f(-1, true))
""", "refuse")
add("shadow_inner_retire_keeps_outer", """function f(k: i32): i32 {
  let x = nn(k)
  if x == null { x = 2 }
  {
    let x: i32 | null = 4
    x = null
    print(x ?? 77)
  }
  return x + 1
}
print(f(-1))
print(f(6))
""", "77\n3\n77\n7")
add("shadow_inner_narrow_then_outer", """function f(k: i32): i32 {
  let x = nn(k)
  {
    let x: i32 | null = nn(k)
    if x == null { x = 9 }
    print(x + 1)
  }
  return x ?? 50
}
print(f(-1))
print(f(3))
""", "10\n50\n4\n3")
add("shadow_param_lambda", """function f(c: boolean): i32 {
  let x: i32 | null = 4
  if c { x = 2 } else { x = 3 }
  const k = (x: i32 | null) => x ?? 77
  print(k(null))
  return x + 1
}
print(f(true))
""", "77\n3")
add("shadow_for_in", """function f(k: i32, xs: (i32 | null)[]): i32 {
  let x = nn(k)
  if x == null { x = 2 }
  for x in xs {
    print(x ?? 77)
  }
  return x + 1
}
print(f(-1, [null, 5]))
""", "77\n5\n3")
add("shadow_path_root", """function f(b: B): i32 {
  if b.v == null { b.v = 1 }
  {
    const b: B = { v: null }
    print(b.v ?? 77)
  }
  return b.v + 1
}
print(f({ v: nn(-1) }))
""", "77\n2")
add("shadow_nested_fn", """function f(k: i32): i32 {
  let x = nn(k)
  if x == null { x = 2 }
  function g(x: i32 | null): i32 { return x ?? 77 }
  print(g(null))
  return x + 1
}
print(f(-1))
""", "77\n3")
# a call that may write, on the path the other arm's write re-narrows (review round 2)
add("call_other_arm_global", """let g: i32 | null = null
function clrG() { g = null }
function f(c: boolean): i32 {
  g = 7
  if c {
    g = null
    g = 7
  } else {
    clrG()
  }
  return g + 1
}
print(f(false))
""", "refuse")
add("call_other_arm_local", """function f(k: i32, c: boolean): i32 {
  let x = nn(k)
  const clr = () => { x = null }
  x = 7
  if c {
    x = null
    x = 7
  } else {
    clr()
  }
  return x + 1
}
print(f(1, false))
""", "refuse")
# nested field joins, both final arms filling
add("field_nested_joins", """function f(b: B, c: boolean, d: boolean, k: i32): i32 {
  if d {
    if b.v == null {
      b.v = 7
      b.v = nn(k)
      b.v = 7
    }
  } else {
    b.v = 7
  }
  if c && b.v == null {
    b.v = null
    b.v = 7
  } else {
    b.v = 7
  }
  return b.v + 1
}
print(f({ v: null }, true, true, -1))
""", "8")
add("elem_stale_retired_overlay", """function f(k: i32, c1: boolean, arr: (i32 | null)[]): i32 {
  arr[0] = nn(k)
  if arr[0] == null {
    arr[0] = 7
  } else {
    if c1 {
    } else {
      arr[0] = null
    }
    if c1 && arr[0] == null {
      arr[0] = 7
    }
  }
  return arr[0] + 1
}
print(f(2, false, [null]))
""", "refuse")
# a straight-line strip before a loop whose body writes null
add("loop_strip_then_null_write", """function f(): i32 {
  let s = 0
  let x: i32 | null = 4
  x = 8
  let i = 0
  while i < 2 {
    if x != null { s = s + x }
    x = null
    i = i + 1
  }
  return s
}
print(f())
""", "8")
# review round 3: a kill on any path survives the meet, and inside a loop on every iteration
add("alias_kill_other_arm", """function f(a: B, b: B, c: boolean): i32 {
  a.v = 1
  if c {
    a.v = null
    a.v = 7
  } else {
    const q = b
    q.v = null
  }
  return a.v + 1
}
const o: B = { v: 3 }
print(f(o, o, false))
""", "refuse")
add("alias_kill_other_arm_swapped", """function f(a: B, b: B, c: boolean): i32 {
  a.v = 1
  if c {
    b.v = null
  } else {
    a.v = null
    a.v = 7
  }
  return a.v + 1
}
const o: B = { v: 3 }
print(f(o, o, true))
""", "refuse")
add("alias_kill_then_refill", """function f(a: B, b: B, c: boolean): i32 {
  a.v = 1
  if c {
    b.v = null
    a.v = 5
  } else {
    a.v = 6
  }
  return a.v + 1
}
const o: B = { v: 3 }
print(f(o, o, true))
print(f(o, o, false))
""", "6\n7")
add("hidden_outer_call", """function f(k: i32, c: boolean): i32 {
  let x = nn(k)
  const clr = () => { x = null }
  if c { x = 3 } else { x = 4 }
  {
    const x = 100
    clr()
    print(x)
  }
  return x + 1
}
print(f(-1, true))
""", "refuse")
add("hidden_outer_call_straight", """function f(k: i32): i32 {
  let x = nn(k)
  const clr = () => { x = null }
  x = 3
  {
    const x = 100
    clr()
    print(x)
  }
  return x + 1
}
print(f(-1))
""", "refuse")
add("hidden_outer_alias", """function f(a: B, b: B, c: boolean): i32 {
  if c { a.v = 3 } else { a.v = 4 }
  {
    const a: B = { v: 1 }
    b.v = null
  }
  return a.v + 1
}
const o: B = { v: null }
print(f(o, o, true))
""", "refuse")
add("hidden_outer_alias_straight", """function f(a: B, b: B): i32 {
  a.v = 3
  {
    const a: B = { v: 1 }
    b.v = null
  }
  return a.v + 1
}
const o: B = { v: null }
print(f(o, o))
""", "refuse")
add("loop_computed_index_after_join", """function f(k: i32, c: boolean): i32 {
  const a: (i32 | null)[] = [nn(k)]
  let s = 0
  let i = 0
  if c { a[0] = 7 } else { a[0] = 8 }
  while i < 3 {
    s = s + a[0]
    a[i % 1] = null
    i = i + 1
  }
  return s
}
print(f(-1, true))
""", "refuse")
add("loop_computed_index_straight", """function f(k: i32): i32 {
  const a: (i32 | null)[] = [nn(k)]
  let s = 0
  let i = 0
  a[0] = 7
  while i < 3 {
    s = s + a[0]
    a[i % 1] = null
    i = i + 1
  }
  return s
}
print(f(-1))
""", "refuse")
add("loop_alias_field", """function f(a: B, b: B): i32 {
  a.v = 7
  let s = 0
  let i = 0
  while i < 2 {
    s = s + a.v
    b.v = null
    i = i + 1
  }
  return s
}
const o: B = { v: 3 }
print(f(o, o))
""", "refuse")
# review round 4
add("kill_refill_vs_null_arm", """function f(a: B, b: B, c: boolean): i32 {
  a.v = 1
  if c {
    b.v = null
    a.v = 6
  } else {
    a.v = null
  }
  return a.v + 1
}
const o: B = { v: 3 }
print(f(o, o, false))
""", "refuse")
add("kill_refill_vs_null_arm_elem", """function f(a: (i32 | null)[], b: (i32 | null)[], c: boolean): i32 {
  a[0] = 1
  if c {
    b[0] = null
    a[0] = 6
  } else {
    a[0] = null
  }
  return a[0] + 1
}
const l: (i32 | null)[] = [3]
print(f(l, l, false))
""", "refuse")
add("write_after_join_renarrows", """function f(a: B, c: boolean): i32 {
  a.v = 1
  if c { a.v = null }
  a.v = 7
  return a.v + 1
}
print(f({ v: null }, true))
""", "8")
add("write_after_join_other_path_live", """function f(a: B, b: B, c: boolean): i32 {
  a.v = 1
  b.v = 2
  if c { a.v = null } else { b.v = null }
  a.v = 7
  return a.v + 1
}
const o: B = { v: null }
print(f(o, o, true))
print(f(o, o, false))
""", "8\n8")
add("loop_other_literal_cell", """function f(a: (i32 | null)[]): i32 {
  a[0] = 2
  let s = 0
  let i = 0
  while i < 3 {
    s = s + a[0]
    a[1] = null
    i = i + 1
  }
  return s
}
print(f([null, 1]))
""", "6")
add("else_restates_held_path", """function f(): i32 {
  const a: (i32 | null)[] = [null]
  a[0] = 7
  if a[0] == null {
    a[0] = null
    a[0] = 7
  } else {
    if a[0] == null { return 5 }
  }
  return a[0] + 1
}
print(f())
""", "8")
add("map_cell_kill_refill_vs_null_arm", """function clr(m: {[string]: i32 | null}) { m["k"] = null }
function f(a: {[string]: i32 | null}, b: {[string]: i32 | null}, c: boolean): i32 {
  a["k"] = 1
  if c {
    clr(b)
    a["k"] = 6
  } else {
    a["k"] = null
  }
  return (a["k"] ?? 50) + 1
}
const m: {[string]: i32 | null} = Map()
print(f(m, m, false))
print(f(m, m, true))
""", "51\n7")
add("map_cell_written_one_arm", """function f(k: i32): i32 {
  const p: {[string]: i32 | string} = Map()
  if k == 1 { p["k"] = 4 }
  if p["k"] is i32 { return p["k"] + 1 }
  return 0
}
print(f(1))
print(f(2))
""", "5\n0")
# deep nesting stress (correctness)
body = "function f(k: i32, c: boolean): i32 {\n  let x = nn(k)\n"
for d in range(12):
    body += "  " * (d + 1) + "if c {\n"
body += "  " * 13 + "if x == null { x = 0 }\n"
body += "  " * 13 + "return x + 1\n"
for d in range(12, 0, -1):
    body += "  " * d + "}\n"
body += "  return 0\n}\nprint(f(-1, true))\nprint(f(-1, false))\n"
add("deep_nest", body, "1\n0")

import concurrent.futures
def run(item):
    name, src, want = item
    fp = os.path.join(out, name + ".vl")
    open(fp, "w").write(src)
    env = dict(os.environ, VL_STD=W + "/std")
    p = subprocess.run(["timeout", "60", VL, "run", fp, "--compiler", seed], capture_output=True, text=True, env=env, cwd=W)
    so = p.stdout.strip()
    if p.returncode != 0 and so == "" and "type error" in p.stderr:
        got = "refuse"
    elif p.returncode != 0:
        got = "FAIL(" + p.stderr.strip().split("\n")[-1][:120] + ")" + (" out=" + so.replace("\n", ",") if so else "")
    else:
        got = so
    if want == "refuse":
        ok = got == "refuse"
    else:
        ok = got == want
    return name, ok, got, p.stderr
with concurrent.futures.ThreadPoolExecutor(int(os.environ.get("JOBS", "8"))) as ex:
    res = list(ex.map(run, P))
bad = 0
for name, ok, got, se in res:
    if not ok:
        bad += 1
    print(("ok  " if ok else "BAD ") + name + " -> " + got.replace("\n", ",")[:200])
print("bad", bad, "of", len(res))
