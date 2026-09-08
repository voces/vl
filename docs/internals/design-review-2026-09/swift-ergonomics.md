# VL Buffer / SIMD surfaces — adversarial API review (Swift lens)

Reviewer stance: Swift API Design Guidelines / "the obvious way is the right way." Scope:
`std/buffer.vl` (shipped), `docs/internals/buffer-design.md` (shipped rationale),
`docs/internals/simd-design.md` (a design doc — **`std:simd` does not exist yet**, so SIMD
findings are against the proposal, spot-checked only where the underlying mechanism — imports,
casts, operator rules — already exists and was run). Every Buffer finding below was reproduced
against `dist/vl` on this checkout; commands are inline. Two external-consumer logs
(`/mnt/d/projects/veldt/docs/vl-notes.md`, `~/glean/docs/vl-issues.md`) supplied the real-user
scenarios; I did not invent friction that wasn't independently hit first.

No praise below by design. Where VL made a defensible call, I say what it costs, not that it's fine.

---

## 1. [CRITICAL] `storeU8` doesn't exist, and the error can't say what does

**Friction.** Loads are named by signedness (`loadU8`/`loadI8`), stores are named by width
(`store8`, no signed/unsigned split, because one wasm instruction truncates for both). A caller
who has just typed `loadU8` reaches for `storeU8` by the same pattern and gets a name that
doesn't exist — and the diagnostic fires at the **import line**, not the call site, so it reads
like a typo in an identifier rather than "this whole naming axis is different for stores."

**Real scenario.** veldt hit exactly this (`vl-notes.md` surprise #1): *"There is no `storeU8`.
Defensible..., but the asymmetry reads as a missing function, and the error surfaces at the
import line rather than the call site."* Reproduced here:

```
$ dist/vl check t3.vl        # import { Buffer, storeU8 } from "std:buffer"
[ERROR]: "storeU8" is not exported by "std:buffer"
  import { Buffer, storeU8 } from "std:buffer"
                   ^
Found 1 error. (parse error)
```

Nothing in that message says "you want `store8`." The design doc even anticipated the optics
(`buffer-design.md:479-487`, O2) — *"say why in the docs so the asymmetry reads as
intentional"* — but the fix landed as one code comment inside `std/buffer.vl` ("a store
truncates, so `store8` has no signed twin for its name to distinguish it from"), which a
consumer never sees; they see the import-line parse error above, with no pointer to the comment,
the design doc, or the sibling name.

**What Swift does.** `UnsafeMutableRawPointer.storeBytes(of:toByteOffset:as:)` is a **single**
generic entry point parameterized by the type witness — there is no `storeUInt8`/`storeInt8`
pair to get wrong, because the type argument *is* the width-and-signedness carrier. Where Swift
does keep a small family of near-miss names (e.g. `Array.first` vs `.last`), diagnostics
routinely suggest the sibling ("did you mean...").

**Fix.** Two independent, cheap moves, either alone would have prevented the veldt loss:
- Ship `storeU8`/`storeI8` (and `storeI16`/`storeU16`) as **one-line aliases** of `store8`/
  `store16`. The design doc's stated cost of NOT doing this — "would falsely imply a signed
  twin exists" — is an internal-consistency argument; the measured cost of doing it as ruled is
  a real consumer's wasted time on the very first buffer program they wrote. Symmetry with the
  load family a caller has *already learned* beats purity of the store family in isolation.
- Failing that, make the "not exported" diagnostic do a fuzzy match against the module's export
  list and suggest the nearest name (see finding 3 — this is one instance of a systemic gap).

---

## 2. [CRITICAL] UFCS forces enumerating every method name, and Buffer/SIMD are exactly the
   modules where that enumeration is worst

**Friction.** VL has no namespace import (`modules-design.md:230`, "no namespace import... in
v1") and UFCS method calls resolve only names actually in scope — so `buf.storeI32(...)` fails
unless `storeI32` itself, not just `Buffer`, is imported. `std/buffer.vl` alone exports **44**
top-level names. A program that reads bytes, writes bytes, and uses one typed view needs to
enumerate a double-digit import list before it compiles, and the list must be edited every time
a new method is reached for.

**Real scenario**, `~/glean/docs/vl-issues.md` VL-002, reproduced here:

```
$ dist/vl check t2.vl      # import { Buffer } from "std:buffer"; buf.storeI32(0, 1)
[ERROR]: 'storeI32' is not imported — a free `storeI32(self: …)` accepting Buf is exported by
"std:buffer"; a UFCS call resolves only names in scope, so import `storeI32` from there
```

The diagnostic is genuinely good (it names the fix precisely) — the *rule* is the problem, not
its reporting. Glean's own words: *"every method used on every std type must be listed in the
import... the list must be edited every time a new method is used."*

**Why this compounds for SIMD specifically.** `simd-design.md` §H estimates **~60 intrinsics**
for the recommended op set, wrapped one-for-one into `std:simd` functions (§D6: "`std:simd`...
zero further compiler lines"). A solver kernel touching `F32x4` load/store/arith/compare/reduce
realistically imports 12-20 names from `std:simd` on top of whatever it already imports from
`std:buffer` for the underlying `Buf`. This is the exact forcing function the project's own
modules design doc predicts for `std:path` (`modules-design.md:249-260`, "Build namespaces
before `std:path`, not after") — Buffer and SIMD hit that wall *first*, and are already over it.

**What Swift does.** `import Foundation` brings a whole namespace; inside a module, extension
methods on a type are visible to any file that can see the type, full stop — no per-method
enumeration. Even Swift's most conservative import forms (`import struct Foundation.Date`) name
*types*, never a flat list of every method you intend to call on one.

**Fix.** The cheapest version that doesn't require a full namespace-import feature: when a type
is imported, make UFCS resolution consult **that type's own defining module** for a
self-taking function, without requiring the method's own name in the import list. This keeps
free-standing (non-method) calls honestly gated by explicit import — it only relaxes the rule
for the receiver-dispatch case, which is precisely the case that is unambiguous (the receiver's
type already pins the module). If that's too big a change to land before `std:simd`, at minimum
land namespace import (already scoped and de-risked at `modules-design.md:234-244`, "the shape
is now decided") *before* `std:simd` ships 60 more flat names into the same problem.

---

## 3. [HIGH] No fuzzy-match / "did you mean" anywhere in diagnostics

**Friction.** Both of the above findings are made worse by a systemic gap: VL's diagnostics
never suggest a nearby name. Spot-checked three ways on this checkout:

```
$ dist/vl check t3.vl   # storeU8 typo for store8
[ERROR]: "storeU8" is not exported by "std:buffer"          # no suggestion

$ dist/vl check t4.vl   # import { Buffer, loadI33 } from "std:buffer"
[ERROR]: "loadI33" is not exported by "std:buffer"           # no suggestion (loadI32 is one edit away)

$ dist/vl check t5.vl   # print(fF(3)) where `f` is declared
[ERROR]: undeclared identifier 'fF'                          # no suggestion (f is one edit away)
```

Every one of these is a single-character edit away from a real name that exists in scope or in
the target module. This isn't a SIMD-specific defect, but SIMD is about to add ~60 short,
similarly-shaped names (`addF32x4`/`addI32x4`/`addU8x16`, `laneF32x4`/`withLaneF32x4`, ...) into
exactly the namespace where a one-letter slip (`I32x4` vs `U32x4`, `reduceAdd` vs `reduceMin`)
is highest-probability.

**What Swift does.** Swift's compiler computes edit distance against every plausible candidate
in scope and prints "did you mean 'X'?" — this has been true since the early SourceKit
diagnostics and is now table stakes for any language with a flat or near-flat namespace.

**Fix.** A single shared "nearest export/identifier" pass over the two error sites above (module
export lookup, identifier resolution) pays for itself the day `std:simd` ships, and would have
independently fixed finding 1 without touching the naming scheme at all.

---

## 4. [HIGH] The compile-time-only lane index is a hard wall with no escape hatch in v1

**Friction.** `simd-design.md` §D4/§O3: `laneF32x4(v, i)` requires `i` to be a compile-time
literal (the wasm `extract_lane` immediate), and a non-literal index is a **checker error**, not
a slower fallback. The doc's own recommendation (O3) picks "(a) require a literal... (c) [const
generics] later" and explicitly **declines (b)**, a runtime-index-via-memory-spill fallback, for
v1. That means the single most natural way to touch every lane —

```vl
for i in 0 to 3 { print(laneF32x4(v, i)) }
```

— is a compile error, forever, until const-generics (A10, itself "unresolved") land. There is no
slower-but-correct path in the shipped v1 surface; a user who needs a computed index has to
hand-roll their own `storeF32x4` + `Buf` + `loadF32` round trip using the exact primitives the
whole `std:simd` layer exists to hide.

**Self-undercutting evidence, from the doc's own survey.** §B4 cites Rust's `std::simd` as
**still nightly in 2026** precisely because "swizzle API is hard to make ergonomic" around
static lane indices — the doc names this as the cautionary tale, then ships the harder-for-users
half of the same tradeoff (literal-only, no fallback) as the v1 recommendation anyway.

**What Swift does.** `SIMD4<Float>.subscript(index: Int)` takes a **runtime** `Int` — Swift eats
the cost (a bounds-checked extract, sometimes a spill) rather than making the hardware immediate
constraint a user-visible wall. The fast compile-time-constant path is an optimization Swift's
compiler may apply; it is never the *only* legal spelling.

**Fix.** Ship the O3(b) fallback (spill-and-index) from day one as the *general* `lane(v, i)`,
and let a compile-time-literal `i` get the fast `extract_lane` path as an optimization the
compiler applies silently — mirroring exactly how VL already treats `f32x4(a,b,c,d)`: "when all
four are compile-time constants it folds to a single `v128.const`" (§D2). That precedent is
sitting two paragraphs above §D4 and is not applied to lane access.

---

## 5. [HIGH] The `as`/`as?`/`as!`/`as%` cast quartet is still undiscoverable at the point of failure

**Friction.** `docs/guide/operators.md` documents the family well, but nothing surfaces it
progressively. Confirmed on this checkout, after `as%` shipped (closing veldt/glean's original
"no wrapping cast exists" complaint):

```
$ dist/vl run t1.vl     # f(0xb81a1aaa) where f(x: i64) { print(x as! i32) }
as! i32 at 2:15: not exact
Error: ... wasm trap: wasm `unreachable` instruction executed
```

The trap message says *"not exact"* and stops there — it does not mention `as%` (the wrapping
cast that exists specifically to serve this case: reinterpreting 32 significant bits) or
`trunc(x) as! i32` (the idiom for the fractional case). A user who traps here has no way to
learn, from the failure itself, that a fourth cast spelling exists that would succeed. This is
the same shape of gap veldt already named: *"it is currently only discoverable from
`DECISIONS.md` + fixtures."* That sentence is still true for `as%`, which shipped later than
veldt's note and is **absent from the runtime trap message** entirely.

**What Swift does.** Swift's failure modes for numeric conversion are `as!`/`as?` too (force vs.
optional), but the *wrapping* alternative (`UInt8(truncatingIfNeeded:)`, `Int32(bitPattern:)`)
is discoverable by autocomplete on the source type/target type pair in Xcode, and the standard
library's doc comments on the failing initializer cross-reference the truncating sibling by
name, right where a user is looking when the exact form fails to typecheck (this is a
compile-time failure for Swift's checked inits, not a runtime trap — a second gap: VL's `as!`
on a **literal-foldable-but-non-constant** expression like `0xb81a1aaa as! i32` traps at
*runtime* for a fact the compiler could often prove statically about a constant sub-expression).

**Fix.** Add "did you mean `as%`?" to the `not exact` trap message whenever the source and
target are both integer types (i.e., whenever `as%` would have been legal at that same call
site) — this is a static, cheap, always-correct suggestion since `as%`'s domain is exactly
`as!`'s domain minus the exactness check. Longer term: when the operand is a compile-time
constant, make `as!`'s exactness check a **compile error**, not a trap — the value and the
target width are both known at compile time in the motivating case (`0xb81a1aaa as! i32`).

---

## 6. [MEDIUM-HIGH] "S0-S3 gives veldt the whole rigid-body solver" is not true of its own op set

**Friction.** `simd-design.md` §G says: *"S3... is the whole rigid-body solver's need — the
first thing that lets veldt measure the 4x."* But S3's op list (§D4) has no `dot`, no `cross`,
no `.xyz`, no `normalize` — those are explicitly pushed to **O7, "later, separable"**: *"a
separate `std:vec` layer... This keeps the SIMD review small and the graphics API free to
evolve."* veldt's own filed ask says its mental model **"is already `vec4`-shaped because it
targets WebGPU/WGSL"** (the doc's own opening paragraph). A rigid-body solver without a `dot`
product is not a rigid-body solver; S3 ships `reduceAddF32x4` and leaves the user to notice that
`dot(a,b)` is spelled `reduceAddF32x4(a * b)` — a translation nowhere in `std:simd`'s own surface,
only in one sentence of O7's prose about a module that isn't built yet.

**What Swift does.** Swift's `simd` module ships `dot`, `cross`, `normalize`, `length` etc.
*alongside* `SIMD4<Float>` from day one — vector math and raw lanes are not staged as two
separate library ships with a design review gap between them, because for every realistic
consumer (veldt included) the "SIMD core" without vector math is an intermediate build artifact,
not a usable milestone.

**Fix.** Either (a) fold a minimal `dot`/`cross`/`.xyz` set into the S3 slice so the sequencing
claim is actually true of veldt's stated workload, or (b) stop claiming S3 alone unblocks the
solver — say S3+the-not-yet-scoped-O7-slice does, and sequence O7 immediately after S3, not in
the "Later, separable" bucket with aligned loads and general static shuffle.

---

## 7. [MEDIUM] Three spellings of "four floats" inside one consumer's own codebase

**Friction.** `simd-design.md` §O2 is explicitly unresolved and picks `F32x4` (PascalCase,
brands an internal `v128`) over lowercase `f32x4` (matches the primitive family's own casing:
`i32`, `f32`) or WGSL's `vec4f`/`float4`. veldt is a WebGPU consumer — its shaders already say
`vec4<f32>`, its CPU rigid-body code will say `F32x4`, and the doc's own §B9/§O7 concede the
`vec4`-flavoured vocabulary belongs one layer up (`std:vec`, not yet built). That means the
*only* consumer who asked for this feature gets, in v1, the one spelling that matches **neither**
their existing GPU code nor VL's own primitive-casing convention — the closest-matching
convention (WGSL) is deliberately deferred, and the doc doesn't flag that tradeoff as a cost
anywhere in §E ("what this decision forecloses").

**Compounding factor already on record in this codebase.** VL has shipped multiple postmortems
about exactly this class of confusion — a name and a representation disagreeing (see the
project's own "two spellings, print the rep" and "the litunion rep cliff" notes) — and two
filed, reproduced consumer defects (`VL-015` — a function named `u8` shadows the type `u8`;
`VL-037`/`VL-041` addendum — `u8` names an array element domain but is not a cast target and
`[]` has no typed-empty spelling). Introducing a *third* representation axis (`v128` hidden,
branded as `F32x4`, PascalCase, unrelated by spelling to `f32`) into a codebase that has already
paid three times for "the name and the rep don't obviously match" is a foreseeable fourth.

**What Swift does.** `SIMD4<Float>` reuses the scalar type name generically (`Float`), so the
lane type and the vector type are visibly related by construction, not by a naming convention a
reader has to already know.

**Fix.** At minimum, put the naming tradeoff explicitly in §E ("Fixed width forecloses...") the
way every other D-decision is; better, resolve O2 by picking `f32x4` (lowercase, matching the
primitive family) so the *type family* relationship is visible in the name the way Swift's is,
and let the future `std:vec` own the WGSL-flavoured spelling on top.

---

## 8. [MEDIUM] Operator overloading for SIMD is a one-off owner exception, not a mechanism

**Friction.** VL's operator rules are: no ad-hoc overloading in general (`DECISIONS.md` B16,
"one binding per name per scope... no ad-hoc overloading for now"), with exactly **one** carved
exception (`"[]"`/`"[]="`, B14) and a **fixed, closed list** of "well-known" operators dispatched
by receiver type (`"+"`, `"()"`, `"[]"`/`"[]="` — B13). `simd-design.md` §O4 has to *ask the
owner* to add `F32x4` et al. to that closed list as a bespoke, named exception: *"Recommend
sanctioning `+ - * /` for the closed `std:simd` type family specifically (not opening general
operator overloading)."* This is not a criticism of the recommendation — it's a criticism of the
mechanism it has to go through. A user who defines their *own* nominal numeric type (`Vec3`,
`Money`, `Complex`, `Duration`) gets **no path** to `a + b` short of lobbying for the same kind
of one-off ruling `std:simd` is currently requesting; B16's "for now" has no stated sunset and no
general protocol/trait mechanism is on the roadmap for this doc to point to.

**What Swift does.** Conform to `AdditiveArithmetic`, `Numeric`, or `SIMD` and the operators
fall out uniformly for **any** type, author's own types included, with zero core-team
involvement per type. Swift's stdlib SIMD types are not privileged over a user's custom vector
type in this respect — they use the same protocol machinery a library author has.

**Fix.** If arithmetic-operator overloading is worth doing for `std:simd`, it's worth asking
whether B13's list should become a `Numeric`-style protocol a user type can opt into, rather than
a permanent enumeration std gets to join by asking and users structurally cannot. Even short of a
full protocol system, name the double standard in §E rather than letting O4 read as if `std:simd`
merely gets to use an existing general mechanism.

---

## 9. [MEDIUM] No generics + no namespaces = one uniquely-spelled function per (op, lane-shape) pair

**Friction.** Outside the four arithmetic operators (contingent on O4 above), every other op in
§D4 — `min`/`max`/`abs`/`sqrt`, lane extract/replace, compare-to-mask, `select`, the reductions,
`swizzle` — has **no** shared spelling across `F32x4`/`F64x2`/`I32x4`/`U32x4`/`I16x8`/`I8x16`/
`U8x16`/`I64x2`. Every one is planned as a fully-suffixed name (`minF32x4`, `minI32x4`, ...,
`laneF32x4`/`withLaneF32x4`, ..., `reduceAddF32x4`, ...). A kernel that legitimately mixes shapes
— f32 solver state plus i32 indices plus u8 voxel bytes, exactly veldt's stated workload —
therefore imports a distinct, only-superficially-related name **per shape** for the same
concept, with no namespace segment to group them (`std:simd` has no `f32x4.min`/`i32x4.min`
option because VL has no namespace import — finding 2). This is the flat-namespace tax the
project's own `modules-design.md:249` names as the forcing function for `std:path`, arriving in
`std:simd` before that revisit lands.

**What Swift does.** `SIMD4<Float>.min(_:)`/`SIMD4<Int32>.min(_:)` are the *same* generic method
name, dispatched by the concrete `SIMD` conformance; a kernel mixing shapes writes `.min(other)`
everywhere and never juggles eight near-duplicate free-function names.

**Fix.** This is the same fix as finding 2, applied to a second module: land namespace import
(or method dispatch by receiver type for a *closed* std family, mirroring B14's existing
exception for `"[]"`) before `std:simd` locks in ~60-120 fully-suffixed names as permanent API
surface with **no deprecation story** (a fact `modules-design.md` states plainly about std names
generally).

---

## 10. [MEDIUM] Relaxed SIMD's determinism is a whole-module build flag, invisible at the call site

**Friction.** §D7/§O6: FMA and other relaxed ops are gated by `-mrelaxed-simd`; without the
flag, `fmaF32x4(a,b,c)` lowers to strict `mul` then `add`. That means **the same VL source
line**, `fmaF32x4(a, b, c)`, means two different things — a deterministic two-op sequence, or a
non-deterministic hardware FMA whose bit pattern can differ across machines — depending on an
out-of-band compiler flag the reader of that line cannot see. This is precisely the well-known
`-ffast-math` anti-pattern: a whole-module toggle that changes the semantics of code that reads
identically either way, which is exactly why modern numeric libraries have moved *away* from
module-wide fast-math switches and toward call-site-explicit alternatives.

**What Swift/Rust do.** Where non-determinism or reduced precision is opted into, it's normally
visible at the use site — a differently-named function, an explicit unsafe/fast-math attribute
on the specific call, or a distinct type — precisely so a reader auditing a physics/replay
codebase (the doc's own stated correctness hazard) doesn't have to also know the build
invocation to know what a line of code does.

**Fix.** Name the relaxed ops distinctly at the call site regardless of the flag (e.g.
`fmaF32x4Relaxed`), and have the flag control only whether that name **exists to call** (a link
error without it), not whether an identically-spelled call silently changes behavior. This keeps
the "off by default, opt-in" property the design wants while removing the "same source, two
meanings" hazard.

---

## 11. [LOW-MEDIUM] `Mask32x4`/`Mask8x16` have a type but no listed constructor

**Friction.** §D1 introduces `Mask32x4`/`Mask8x16` as branded `v128` newtypes (a real strength —
credited nowhere else in this doc, but not re-praised per the brief). §D2 ("Construction") lists
splat and lane-literal constructors only for the **value** vector types; no constructor for a
`Mask*` type is listed anywhere in §D1-§D4. The only documented way to obtain one is as a
compare's output (`ltF32x4(a,b): Mask32x4`). A user who wants to hand-build a specific lane
pattern for `selectF32x4` (e.g., "take lanes 0 and 2 from a") has no primitive — the only
workaround implied by the doc is faking it through a comparison engineered to be true in exactly
the desired lanes, which is not obvious and is not written down anywhere in §D.

**What Swift does.** `SIMDMask` has direct construction from a `Bool` sequence
(`SIMDMask(arrayLiteral:)`) independent of ever computing a comparison.

**Fix.** Add a mask literal/constructor (e.g. `maskF32x4(a: bool, b: bool, c: bool, d: bool):
Mask32x4`) to §D2 alongside the value-type constructors, so a mask is a first-class constructible
value and not only a comparison byproduct.

---

## 12. [LOW] The "domain vs. type" confusion class will very likely recur at `v128`

**Friction, predictive.** VL already has one real, three-times-filed confusion family around
`u8`: it's an array-element **domain**, not a real type — you can declare `u8[]`, you cannot
declare a `u8` local/param/field, and `as u8` is refused ("unknown type `u8` in `as` cast" —
VL-037) even though `u8[]` type-checks fine. A function *named* `u8` shadows the (non-existent
as a standalone type, but resolvable inside `[]`) primitive spelling entirely, with a message
that names neither the shadowing binding nor the rule (VL-015, a five-program bisect to
diagnose). `simd-design.md` §D1/§O9 introduces a second such asymmetric primitive: `v128` is "a
new primitive scalar type the compiler knows... never spelled by users directly" — i.e., another
name that resolves to something in the type grammar but is deliberately unusable the way a user
would expect a type name to be usable. Nothing in the design doc works out what the checker
should say when a user inevitably writes `let x: v128 = ...` or `y as F32x4` (a currently-legal-
looking cast spelling nowhere ruled on) — the same class of "the name exists in the grammar but
almost nothing you'd try with it works" trap that has already cost three filed defects on `u8`.

**What Swift does.** Swift has no comparable "grammar-visible but semi-forbidden" primitive;
where a type is meant to be internal, it's simply not exported from the module, so there is no
name for a user to type in the first place, and "unknown identifier" is the (correct, boring)
result.

**Fix.** Before `v128` ships, write the checker error for the two obvious first mistakes (`let
x: v128 = ...`, `x as v128`, `x as F32x4`) and put them in `simd-design.md` next to O9, the same
way O3 pre-commits to what the lane-index error says. A primitive that's "in the grammar but not
for you" is cheaper to make safe by **not putting it in the grammar at all** — brand the newtype
over an *anonymous* compiler-internal rep with no user-facing spelling whatsoever, rather than
over a named-but-forbidden one.
