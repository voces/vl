# Persona review: game-engine / performance programmer (`game-perf`)

**Who I am.** I write the inner loops of engines: voxel meshing, particle integration, the
transliterated x86 of an old RTS's simulation step. I think in frame budgets (16.6 ms, and a
GC pause that eats 4 ms of it is a bug), in structure-of-arrays and flat records in linear
memory, in `f32x4` lanes and bit-packed fields. I read the generated wasm. What I want from a
language: a `.` I can trust without opening another file, no allocation I did not write, cost
that is not data-dependent where I didn't ask for data dependence, and an optimizer that is
told the facts it needs. I will trade syntax sugar for any of those.

Probes are in `persona-review/game-perf/` (`p1.vl`–`p10.vl`), run with `dist/vl` on this
checkout (HEAD `35ee5d9a5`). Disassembly used `node_modules/.bin/wasm-dis`. `-O3` needs
`VL_WASM_OPT=node_modules/.bin/wasm-opt`.

---

## Q1. Should the body contract be a hard error? **Agree: keep it an ERROR, for everyone.** Fix what makes it chafe instead.

The case for a warning rests on "a slow getter is a performance surprise, not unsoundness".
From where I sit, the **compliance cost** of the error is what decides it, and that cost is two
characters. A getter that fails the contract is just a method: `v.norm()` instead of `v.norm`.
Nothing that the contract refuses becomes inexpressible. It only loses the parenless spelling.
That is a much cheaper refusal than any refusal VL makes for soundness. Compare C#'s
Framework Design Guidelines: they tell you to use a method for anything expensive, and the
advice is the same as VL's rule. C# just doesn't enforce it, so every engine team rediscovers it
(Unity's `Camera.main` was a `FindObjectWithTag` behind a property for about a decade, and
"cache `Camera.main`" was folklore in every perf guide; `transform.position` walks the
hierarchy; `.mesh` *allocates a copy*). Those are all getters that look like a load and are not
one. They are the reason I distrust `.` in C#.

A warning plus `// vl-allow getter-cost` turns this into a promise that holds except where
someone opted out. That means I have to check again at every `.`, and checking is the cost I
wanted the language to take away. The trust only pays if it has no exceptions. Rust and Zig get
this by having no getters at all. VL gets it by checking them, which I think is better than
either.

Two scoping points:

- **"std only" is the wrong boundary.** The code I read and don't own is a vendored module from
  another team, or plumb's generated code, not std. Per-module strictness would split `.` into
  two dialects.
- **What actually chafes is not the cost rule. It is the v1 callee rule** ("intrinsics and
  getters only"), and a defect in its intrinsic list (Finding 1). Fix those, land S2
  (getter-eligible summaries for callees), and the case for relaxing to a warning mostly goes
  away.

If the owner still wants an escape, make it **a declaration-site one that shows at the use
site**, not a comment. For example, the semantic token could colour a getter that took the
escape as a method. A per-site suppression comment, VL's first, is a lot of new machinery for
the one rule where the fix is always to type `()`.

## Q2. Constant-bounded loops, budget 64. **Modify: the invariant is the right stopping rule; the number is wrong, and constant loops buy less than they look like.**

The invariant ("worst case computable from source plus callees, never data-dependent") is a
real stopping rule. It is the same line GPU shader languages draw (WGSL forbids recursion; HLSL
`[unroll]` needs a compile-time trip count), and frame-budget code cares about exactly that
line. Data-dependent cost is what blows a frame, and constant cost is what I can profile once.
It is not a slippery slope, because the next step (a data-bounded loop) violates the invariant
rather than moving a number.

But three things from the perf side:

1. **The budget counts back-edges, not work.** Straight-line code is `Bounded(0)` however long
   it is. A 300-line unrolled getter passes and a 65-iteration loop of one add fails. That is fine
   as a *termination* guarantee and meaningless as a *cost* one. Say so in the docs, and don't
   let "64" read as a cost bound.
2. **64 has no consumer.** The widest SIMD shape is 16 lanes (`U8x16`). A 4×4 matrix's
   trace/determinant is straight-line. A 4×4×4 = 64 nest only occurs in a matmul, which returns
   a matrix and so allocates, which is refused anyway. 64 iterations of a load and an add inside a
   getter that sits in a 100k-element loop is 6.4M extra iterations a frame, which is exactly
   the "would we feel bad" case. **Recommend 16**, which is the largest real lane count, and
   raise it with a named consumer. The design already says only raising is safe.
3. **The motivating example does not type-check.** The amendment's tier-2 example is "a
   four-lane reduction written as `for i in 0 until 4`". The index is an `i32`, but
   `lane(i: 0|1|2|3)` needs a `Lane4`. Probe `p3.vl`:
   `for i in 0 until 4 { s = s + pick(i) }` gives `argument 1: expected 0 | 1 | 2 | 3, got i32`.
   So a constant loop can't index lanes, the one place a lane getter would want a loop. It can
   loop over `__load_f32__(base + i*4)`. But binaryen does not unroll loops, so at `-O3` that
   stays a real loop with a back-edge per `.x` read, and hand-unrolled straight-line code is
   strictly faster. **Either give the constant-range loop variable the literal-union type of its
   range** (`for i in 0 until 4` gives `i: 0|1|2|3`, which is sound and would make `lane(i)`
   work and fold after unrolling), **or unroll constant-range loops in getters before emit.**
   Without one of those, the relaxation lets people write the slow form of code they could
   already write fast.

## Q3. Setters. **Modify: narrow "none" to "none that write to `self`". Setters that write *through* a handle are the data-oriented case, and they have no write-back problem.**

CS1612 and Swift's `modify` exist because a setter on a value type mutates a *copy* of the
receiver. The flat-row pattern (flat-records §9) is a value type whose setter does not touch
the receiver at all. `RowAddr = new i32` is an address, and "set" is a store *through* it:

```vl
type RowAddr = new i32
get hp(self: RowAddr): i32 { __load_i32__(self as! i32) }
function setHp(self: RowAddr, v: i32) { __store_i32__(self as! i32, v) }
u.hp = u.hp - 7   // p5.vl: "cannot assign to `.hp`: … a getter is read-only"
u.setHp(u.hp - 7) // what I must write today
```

This is my hot path: `units[i].hp -= dmg` over an SoA/flat table. Today it reads
`units[i].setHp(units[i].hp - dmg)`, which is asymmetric and also computes the address twice at
`-O0`. The rule that avoids CS1612 is **not "value type vs. reference type"**. It is **"the
setter's body never assigns `self`"**, and that is checkable with the same walk. `self` is
already a parameter the body can't meaningfully write back. Under that rule:

- a value-type brand over a *scalar payload* (`Color = new i32`, `F32x4`) gets no useful setter,
  because every write would have to be to `self`. `withLane` stays the answer, and nothing
  changes for SIMD;
- a handle/address brand (`RowAddr`) and a reference-backed brand get `set x(self: T, v: R)`;
- `u.hp -= 7` desugars to one address computation, a get, and a set. That is the one place the
  compiler should bind the receiver once, and it is a real `-O0` win over the method spelling.

The setter body should get a cost contract of its own: effect *allowed* only as stores through
`self`-derived addresses or `self`'s fields, bounded, no allocation. Otherwise
`units[i].hp = x` hides a log write. I would not block v1 on this, but I would not rule
"none, and none planned" (F7) either. The owner ruling should record that the flat-row setter is
the known consumer.

## Q4. Getters satisfying read-only structural contracts. **Modify: yes, but only as a generic BOUND, never as a value type, and never with adaptors.**

`<T: { readonly x: f32 }>` at a monomorphized position costs nothing. The instance's `.x` is a
`struct.get` in one instance and an inlined getter in the other (A1/A2 already measure this). I
would use that for generic mesh code over `Vertex` (fields) and `PackedVertex` (getters over an
`i64`).

**Non-specialised positions are where I'd push back hard.** A witness table or adaptor behind
a heterogeneous `{ readonly x: f32 }[]` is an indirect call per `.x`. That is the Unity
`transform.position` problem again, hidden behind a dot and a type that looks like a record. If
`{ readonly x }` is allowed as a *value type* at all, it has to be layout-only (fields), and a
getter-backed value refused there loudly. Make it a **bound-only** form: the grammar admits
`readonly` members only inside `<T: …>`. That also avoids the position-dependent split the
design rightly fears (§C2). The answer never depends on where the value is delivered, because
it is only ever asked at a pin.

## Q5. Getter-eligible is not `pure`. **Agree.**

A getter that can't read mutable receiver state is useless. `particle.speed` reads the current
velocity, and that is the point of the getter. Equating the two would also make `pure` mean "cheap",
which §E2 rightly refuses. The one thing I'd add: `R.mem` being admitted wholesale (no address
analysis) means a getter over a flat row can read *any* linear memory. That is fine for the
contract (no effect, bounded), but hover should show `reads linear memory` on the getter, because
that fact is what stops hoisting across stores (Q6).

## Q6. The effects summary. **Agree on the shape, with three gaps an optimizer will hit first.**

The per-instance, bottom-up, never-in-types, checked-only-at-boundaries shape is right, and
"global inference only for speed" is the right principle. It matches how D's attribute
inference for templates is the part of D that people actually like, while written `@nogc pure
nothrow` soup is the part they don't. The gaps:

1. **`W` is one bit while `R` is split. Hoisting needs the split on both sides.** §G2 says the
   `R.let`/`R.mem` conflict is "a cheap check against the loop's own `W` sources". It is cheap
   only for *syntactic* writes in the loop body. Any call in the loop contributes only `W`, and
   `W` does not say where. So `for … { integrate(p); s += cfg.gravity }` can't hoist the
   `cfg.gravity` getter past `integrate`, even though `integrate` writes only linear memory.
   Split `W` as `W.let`, `W.heap[root]`, `W.mem`. That is LLVM's `memory(argmem: write)`, and it
   is the fact every DOD kernel has: *writes only through its arguments*.
2. **`R.heap`/`W.heap` by root class is too coarse for SoA code; WasmGC gives type-based alias
   classes for free.** HotSpot C2 slices memory by (type, field) (§B2). In WasmGC a
   `struct.set $Particles 3` can't alias a `struct.get $Particles 1`, and arrays are typed.
   Record a small set of `(struct type, field)` / `(array type)` classes, collapsing to "any"
   past N. That is what lets `p.count` hoist out of a loop that writes `p.xs[i]`, which is the
   most common loop in my code.
3. **The doc's own hoisting example is not admitted by its own analysis, and it doesn't need
   to be.** §A5's `popcnt` uses `while`, so under §C1a it is `Unbounded`, not "terminating",
   and §G2's hoist rule refuses it. (I re-ran it as `p10.vl`. Adding
   `--generate-global-effects --licm` to the pinned binaryen still leaves both loops nested, as
   the doc predicts.) But termination is only needed for *speculative* hoisting. The standard
   LICM move is loop rotation: guard the preheader with "the loop runs at least once". Then the
   hoisted call runs exactly when the original's first iteration would, and divergence is
   preserved **provided no effect precedes the call in the body**. So the optimizer rule should be
   "effect-free ∧ (terminating ∨ (trip-guarded ∧ no earlier effect in the body))". That hoists
   `popcnt` and every `while`-based helper. Otherwise the bound, a checker-side acceptance
   fact, gets over-sold as an optimizer enabler.

Also missing: **an allocation assertion a game can put on a frame root.** D's `@nogc` is the D
attribute game programmers actually use. What I want is not `pure` but "`update()` and
everything it calls allocate nothing". The doc judges `A` on source (§C3) for locality. That is
the right call for acceptance, but it means the thing the GC actually sees (rep boxes, A6's
`keepIf<f64>`) is a hint only. Offer it as a **test-time or CLI assertion over emitted
instances** (`vl check --deny-alloc=update`, or a `std:test` helper) and not as a language
marker. Rep-dependence is fine there, because a failing frame-budget assertion after a rep
change is exactly the alarm I want.

Not excessive: `U` reserved for free, and `T` optimizer-only, are both right. I'd drop nothing.

---

## Findings beyond Q1–Q6 (ranked)

**1. DEFECT: the getter intrinsic allowlist omits every scalar math and bit intrinsic, each of
which is one wasm instruction.** `getterIntrinsics` (`compiler/typecheck.vl:36528`) lists loads
and `f32x4` ops only. Probes `p8.vl`/`p9.vl`, each `get g(self: M) { <op>(self as! …) }`:
`sqrt`, `abs`, `floor`, `min`, `popcnt`, `clz` and `rotl` are all refused with "calls `sqrt`,
which is neither a pure intrinsic nor a getter". These are `f64.sqrt`, `i32.popcnt` and so on
(`wasmEmit.vl:14253` `floatIntrOpF32/F64`, `intIntrOpI32`). So the canonical vector getter
`get len(self: V3): f64 { sqrt(self.x*self.x + …) }` (`p2.vl`) is refused, and so is every
packed-bitfield getter a voxel engine writes (`get solidCount(self: Mask) { popcnt(…) }`,
`get lowestFace(self: Faces) { ctz(…) }`). The contract's own text says "intrinsics" are allowed,
and these are the most intrinsic operations the language has. Fix: add every entry of the
float/int intrinsic op tables (ceil, trunc, nearest, copysign, ctz, popcnt, rotr, and the
unsigned compares), and derive the list from those tables rather than keeping a second
hand-written copy (DRY, and it won't drift when S4 adds `i32x4`/`u8x16`, which are missing today
too).

**2. The v1 callee rule forces copy-paste of any helper with two arguments.** A getter can call
only intrinsics and getters, and a getter takes exactly one `self`. So `function sq(a: f64)` or
`dot(a, b)` can **never** be called from a getter (`p2b.vl`: `sq` refused three times, once
per call; `p2.vl`: std's `hypotF64` refused). The only compliant spelling is to inline by hand.
For bitfield code that means duplicating shift/mask helpers into every getter. S2 (callee is
getter-eligible by summary) removes this. **Sequence it immediately after the allowlist fix,
before any contract relaxation such as loops.** Loops are a nicety, but calling a helper is basic.
Also: report the refusal once per getter, not once per call site.

**3. At `-O0`, every getter read is a real `call`, and the default build is `-O0`.** `p1.vl`:
`c.r` in a loop is `call $Color.r@2` per read (the `-O3` build folds the whole loop to `+18`).
Debug-build frame rate matters to game developers: people ship debug builds to testers, and a
debug build at 5 fps is unusable. The checked contract makes getters the one place where
**always-inline at the VL level is trivially safe** (no recursion, bounded, tiny, no
allocation), so the pre-emit rewrite could substitute the body rather than emit a call. Then
"a `.` is a load or a short sequence" is true at every optimisation level, not just `-O`. That
trades the "byte-identical to `x(v)`" test for a stronger property. I'd take the trade.

**4. The contract steers flat-row authors to raw `__load_*__` intrinsics instead of
`std:buffer`.** `p6.vl`: `loadF32` (std, `R.mem`, tier 1) is refused in a getter, and
`__load_f32__` is accepted. So the documented getter pattern for flat memory (guide
§"What it costs") is written in double-underscore intrinsics that std's own header treats as
substrate. Users will copy the pattern and get raw, unchecked addressing, which is the reverse
of what `F32View`'s checked API is for. Finding 2's fix solves this too. Until then the guide
should say it is a v1 limitation.

**5. `u.hp -= dmg` on a handle getter should bind the receiver once.** This matters only once Q3's
narrowed setters exist, but the spelling decision is now. For `units[i].hp -= dmg`, the index
expression (a user `"[]"` call computing `base + i*size`) must be evaluated once, not twice. That
is the same "compound assignment evaluates its place once" rule every C-family language has,
and it is easy to get wrong when a getter and a setter lower to two separate calls.

**6. Narrowing through getters is withdrawn, which is right, but it has a codegen cost worth
saying in the guide.** `if v.p != null { v.p.z }` re-reads through the getter, and binding
`const p = v.p` is both the typing fix and the perf fix. The guide shows the binding as a
*typing* workaround. It should also say it is the idiom in hot code.

---

## Adopt / warn away

**Adopt:**
- **HLSL/WGSL's rule for bounded loops, all the way**: a constant trip count should mean
  *unrolled*, and the loop variable should be a compile-time value (Q2). Shader compilers
  have lived with "constant-bounded, no recursion" for twenty years. That is the nearest real
  precedent to VL's contract (my addition to the survey, which found none among CPU languages).
- **LLVM's `memory(argmem: write)`** as the `W` split (Q6.1), and **C2's type/field alias
  slices**, which WasmGC's typed heap gives VL for free (Q6.2).
- **D's `@nogc` as a *checkable assertion*, not an attribute.** Put it on frame roots, as a
  test or CLI check (Q6).
- **Loop-rotation-guarded LICM** instead of requiring termination (Q6.3).

**Warn away from:**
- **C#/Unity-style "properties are guidelines".** Every engine perf guide exists partly
  because `.` lied. Keep the contract an error (Q1).
- **Witness tables behind a record-looking type** (Q4). If `.x` can be an indirect call, I
  have to read every type's declaration again.
- **A budget number that reads like a cost bound.** 64 back-edges says nothing about cycles.
  Pick 16 and call it a termination bound (Q2).
- **Relaxing the contract in the order "loops first, calls later".** The ordering is backwards
  for real getter code (Findings 1–2).
