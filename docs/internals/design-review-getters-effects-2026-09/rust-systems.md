# Persona review: getters and function effects, from the Rust/systems chair

**Who I am.** I write Rust for engines and codecs, and I read other people's Rust in hot loops.
Rust has no properties on purpose: a field access never runs user code (`Deref` is the one
exception, and it is contested), and anything computed is `fn x(&self) -> f32`, with the parens
in plain sight. I value explicit costs, no hidden control flow, and contracts the compiler checks.
Rust's `const fn` taught me that a checked cost contract you opt into is fine. It shipped with no
loops, got them in 1.46, and still refuses the heap. The keyword-generics/effects work taught me
that putting effects in types is years of pain. I judge VL by one question: when I read `v.x`
in a loop, can I tell what it costs, and does the compiler back that up?

Probes are in `persona-review/rust-systems/`, run with `dist/vl run` on the tree at `35ee5d9a5`.

---

## Q1. Should the body contract be a HARD ERROR? **Agree: keep it an error. Reject the suppression comment and the std/user split.**

The survey frames getters as a feature every language has, and then notes that no language
restricts their bodies. That is the wrong comparison. The right one is **an opt-in syntax that
carries a checked contract, with a free escape to a plain function**. That has plenty of precedent:

- Rust `const fn`: write `const` and the body is checked (no heap, and before 1.46 no loops). If
  it fails, remove `const` and you have an ordinary `fn`. Nobody asks for `#[allow(const_fn_heap)]`.
- C++ `constexpr`, Zig `comptime` (with `@setEvalBranchQuota`), WGSL (no recursion), Fortran `PURE`.
- Rust refuses implicit `Clone` for performance reasons alone. A deep copy has to be written
  `.clone()`. So "VL refuses nothing else purely for performance" is not an argument from
  precedent: making a cost visible by refusing the implicit form is a normal choice in a
  systems language.

In VL the escape costs nothing. `v.x()` compiles to the same wasm at `-O`/`-O3` (property-access
§A2). The error is therefore not "you may not write this". It is "if you want this to look like a
field, it must cost like one, and otherwise spell it as a call". That is the Rust answer exactly,
and the error message should say it: *"getter `len` loops over data; declare it as
`function len(self: V)` and call it `v.len()`"*.

Against the proposal:
- **The std-error/user-warning split creates two dialects of `.`.** The perf consumers (veldt,
  sunsuz, plumb) read their own getters and each other's code. A contract that only holds for std
  tells a reader of `v.x` nothing unless they first find where `v`'s type is declared.
- **`// vl-allow getter-cost` puts a hidden cost behind a comment.** It is also VL's first
  per-site suppression, introduced for the one case where a free spelling already exists. If VL
  ever gets per-site suppression, make it an item attribute the checker parses (Rust's
  `#[allow(...)]`). It should not be a magic comment, and it should not arrive through this door.
- **The condition for keeping the error: the contract must actually hold.** A checked guarantee
  with holes is worse than a lint, because people rely on it. Findings 1 and 2 are two holes I
  found in ten minutes. Close them, or the argument for a hard error loses its footing.

## Q2. Constant-bounded loops within a budget of 64. **Modify: the invariant is the right stopping rule, but "iterations" is the wrong unit, and the rule is already broken once.**

"Worst case computable at compile time and never data-dependent" is a good, bright stopping line.
It is what makes `const fn` loops and `@setEvalBranchQuota` workable. The slope stops where the
data starts, and I would defend that line permanently.

But the budget counts **loop iterations**, and cost is not iterations:

1. **Straight-line getter fan-out is exponential, and the contract scores it at 0** (Finding 1).
2. **Branches are summed, not maxed.** §C1a's formula sums over every loop in the body, while tier
   2 says cost is "the longest path". `if c { for i in 0 until 40 {…} } else { for i in 0 until 40 {…} }`
   costs 80 and is refused, although no execution does more than 40. Pick one. Max-over-branches
   is what the tier text promises.
3. **The I15 helper exemption already breaks the invariant** (Finding 2). f64 `%` counts 0, and its
   real cost depends on the data.

Recommendation: measure an **abstract step count**. Each intrinsic, call and loop iteration is one
step. Calls add the callee's steps, loops multiply, branches take the max, and compiler helpers
are charged their true worst case. Set the budget in steps (a few hundred). That one unit covers
loops, fan-out and helpers, and it is still computable from source. What the owner calls a
slippery slope is really the lack of a cost unit. With a unit, "raise the number" is the only
lever, and the invariant stays fixed.

## Q3. Setters. **Agree with "none", for value AND reference types. Do not narrow it.**

In Rust, assignment is a store to a place. `IndexMut`/`DerefMut` are the only user code that runs
on the left of `=`, and they return a *place*, they do not intercept the write. A reference-type
setter would make `a.x = b` run arbitrary code, and it would make `a.x += 1` two hidden calls
(get then set), which is C#'s and Swift's footgun. What the reference case really wants is
validation or read-only data. That is `readonly` fields (A9) plus a `setX(self, v)` or
`withX(self, v)` method, which is the Rust `set_x(&mut self)` convention. The only measured
demand in the doc (§A5, `F32View.length`) is a *read-only* problem, and a setter would make it
worse.

## Q4. Getters satisfying `{readonly x: f32}`. **Modify: yes at monomorphised positions, a loud refusal at erased ones, and never a synthesised adaptor.**

This is Rust's trait split: `fn f<T: HasX>(t: &T)` is monomorphised and free, while `&dyn HasX`
is a vtable that you *spell*. The owner is right that `{readonly x}` is a contract, not a layout.
At a specialised position a getter satisfying it is a `call` in one instance and a `struct.get` in
another, and both inline to the same thing. That is zero-cost abstraction done properly.

At non-specialised positions (a heterogeneous list of a structural type, a struct field, a
function-typed parameter), the choices are a witness table or a snapshot. **VL must not make that
choice silently.** A snapshot is TypeScript's hole (check-clean wrong under mutation), and a
compiler-built witness table is `dyn` with the `dyn` erased from the source. Refuse there, naming
the position, as annotated `{x: f32}` given a wider struct is refused today. If erased dispatch is
ever wanted, give it a spelling a reader can see.

Also: never let a plain `{x: f32}` bound (read and write) accept a getter. Only `readonly` should.

## Q5. Getter-eligible is not `pure`. **Agree.**

This matches Rust's `&self` accessors and C++ `const` member functions: they read mutable receiver
state and write nothing. Rust's own `const fn` is closer to getter-eligible than to `pure` (it
reads through references and cannot allocate). Keeping `pure` for "effect-free, no ambient
reads" and not for cost is the Koka/D/Fortran meaning, and it is right. Two different predicates
over one summary is the correct design. One word stretched to cover both would be the mistake.

One consequence the doc misses (see Finding 5): because the getter contract excludes writes and
`let` reads, **two reads of the same getter with no intervening write agree**. That is the same
condition under which a field path narrows. Kotlin refuses smart casts through custom getters
because Kotlin getters are unchecked. VL's are checked, so the Kotlin rule is more conservative
than VL needs.

## Q6. The effects summary. **Agree with the shape. Add a size/step unit, and treat inferred facts as API.**

What is right:
- **Inferred, never in function types, with a checked marker only at the boundary.** This avoids
  exactly what Rust's keyword-generics work is still fighting: `~const`/`[const] Trait` bounds,
  `async` versus sync trait splits, the colouring tax. VL is whole-program, so it can infer what
  Rust has to annotate.
- Splitting reads by location, and keeping `T` (trap) separate from effects, matches LLVM,
  binaryen and Cranelift.
- Nim's charge-the-call-site rule for callbacks is the right v2. It gives `rethrows` without the
  syntax.

What is missing or wrong:
- **An inferred property that callers depend on is API, even if nobody wrote it.** This is Rust's
  auto-trait leakage through `impl Trait`. `Send` leaks out of a function body, and changing the
  body is a semver break nobody sees. The std baseline file is the right fix for std. Make sure
  hover on a *user* getter that calls std shows which std bound it is spending, so the
  dependency can be seen before an upgrade breaks it.
- **`B` counts loop iterations only.** See Q2 and Finding 1. It needs a step or size unit, or it
  cannot back the tier claims.
- **`#[inline]`-class facts.** A getter-eligible body is non-recursive and bounded, which makes it
  *always safe to inline*. The summary should say so, and the getter lowering should use it
  (Finding 3).
- Excessive for v1: the `R.heap[param|const]` root split has one consumer (`pure`), and `pure` is
  stage S3. Carry the bit but don't build UI for it yet.

---

## Findings beyond Q1–Q6 (ranked)

### 1. Getter-to-getter fan-out is exponential and passes the contract. A single `.x` ran 67 million calls.

`persona-review/rust-systems/p2b_fan.vl`, loop-free and allocation-free, accepted by the shipped v1 checker:

```vl
type C = new i32
get a0(self: C): i32 { (self as! i32) + 1 }
get a1(self: C): i32 { self.a0 + self.a0 + self.a0 + self.a0 }
// … a2 through a13, each four reads of the previous
print(c.a13)   // 268435456: 4^13 ≈ 67M getter calls behind one `.a13`
```

Built without `-O`, the module has 54 `call`s, and a single read of `c.a13` runs 4¹³ getter calls.
The v1 contract (loop-free, recursion-free) accepts it, and so does the amended bound: it has no
loops, so `Bounded(0)`. The cost comes from the call DAG, not from any loop. This is the
same class as D1513 (an unmemoised exponential), and here it sits behind something that looks
like a field read. **Fix:** charge each call its callee's cost (the step unit of Q2). Budget 64
then refuses this at `a3` or so. It also bounds code size if getters are inlined (Finding 3).

### 2. f64 `%` makes getter cost data-dependent, against the stated invariant.

`__f64_rem__` (`compiler/emit_sections.vl:3212`) is "scaled repeated subtraction": it doubles `b`
up to `a` and halves back down, which is O(exponent gap), up to about 2×2098 iterations. I15 and
§D3a-contract count it as 0 because it is "bounded by the float format". Bounded, yes. Cheap and
data-independent, no:

| probe (`p3_rem_*.vl`, 200,000 reads of `get m(self: R): f64 { (self as! f64) % 1.5 }`) | wall |
| --- | --- |
| receiver `3.0` | 0.011 s |
| receiver `1.7e308` | 0.368 s (~33×) |
| `p1_rem.vl`: receiver `1.7e308`, divisor `5e-324` | 1.42 s (~7 µs per `.m`) |

The same getter on different *data* costs 100× more. That is exactly what the §C1a invariant
("never depends on data") rules out. The worst case is a 64-budget getter whose loop body holds a
`%`, which is about 64 × 4k subtractions. **Fix:** charge helpers their true worst case (then `%`
is refused in getters, or admitted under an honest step budget), or give f64 `%` a
constant-time lowering (an `fmod` via exponent extraction and a fixed number of steps). Do not
keep an exemption whose stated reason is false.

### 3. At the default `-O0` build, `.x` is a call, and getters are the one class that is always safe to inline.

The guide says "nothing over the call". But the call is the cost: the default build is
unoptimised (`open-rulings` O-default-build-optimizes), so `v.x` is a `call` and `v.lane(2)` is a
call plus up to three compares (§A7). Rust has this same debug-build problem, which is why glam
and `std::simd` put `#[inline(always)]` on every accessor. VL's contract already proves
what `#[inline(always)]` needs: no recursion, a bounded body, no allocation. **Recommend**
expanding getters inline at the Member→Call rewrite, or marking them for inlining at every opt
level. Then `.x` is a load in every build, not only at `-O`. Finding 1's step budget is what
keeps that expansion from blowing up code size.

### 4. User operator overloads (`"+"`, `"[]"`) are unchecked hidden control flow, and the getter rationale applies to them at least as strongly.

The getter contract exists because "`.` should cost like a load". But `a + b` and `v[i]` on a
nominal type may already loop, allocate and `print`, with no contract at all. Rust has the same
gap (`Add`, `Index` are unchecked, and `Index` is "expected O(1)" only by convention). Zig solves
it by having no operator overloading. I am not asking for a contract on `+`. But **a `"[]"`
overload is the member-read of indexing**, and B6's O(1) rule reads naturally onto it. At minimum,
use the same summary for a hover line and a lint (`index overload is Unbounded`). Otherwise the
doc should say why `.` is held to a standard `[]` is not.

### 5. The checked contract earns narrowing, and v1 leaves it unused.

"A getter is never a narrowing place" is Kotlin's rule, and Kotlin needs it because a custom getter
can do anything. A VL getter cannot write and cannot read module `let`s. Its result changes only
if the receiver's heap or linear memory is written, and that is the same invalidation a field path
already needs. So `if v.p != null { v.p.z }` could narrow under the rule fields already use. This
is additive and can come later. It is also the best argument the owner has for Q1: a hard
contract buys a language feature, not only a perf promise.

### 6. The lane index relies on the optimizer. Rust uses const generics here.

`core::arch` immediates are const generics (`_mm_extract_ps::<IMM>` via
`rustc_legacy_const_generics`, and `simd_swizzle!`), so a lane read is one instruction in every
build. VL's literal-union ladder is one instruction only at `-O`/`-O3`, and a runtime `Lane4`
silently becomes a four-way branch that looks the same as the constant case. That is acceptable
for v1 (D4 is rightly deferred), but the guide should state the `-O0` cost, and a hint on a
non-literal `Lane4` argument (F3 option (c)) is cheap and honest.

---

## What I would ADOPT from Rust/systems practice

- **Opt-in syntax with a checked contract and a free escape** (`const fn`). Keep the error, and put
  the method spelling in the message.
- **`#[inline(always)]` semantics for getters**, derived from the contract rather than written.
- **Explicit erasure** (`dyn`). Structural contracts are monomorphised or refused, never quietly
  adapted.
- **A cost unit the compiler actually counts**, like Zig's branch quota: one number over steps,
  not iterations.
- The API guideline **C-GETTER** naming (`x`, not `get_x`) is already how `get x` reads. Keep
  std's `lane`/`withLane` pair shaped like Rust's `with_*` builders.

## What I would warn VL AWAY from

- **`Deref`-style getters.** glam's SIMD `Vec4` gets `.x` through `Deref<Target = XYZW>`, which
  spills the register to memory in debug builds. Getters as declared functions over intrinsics
  are better. Do not let "getter returns a view struct" become the general pattern.
- **Comment-based suppression**, and a contract that holds only in std.
- **Exemptions justified by "bounded" when the point was "cheap"** (f64 `%`). Every exemption
  should state its real worst case.
- **Effects in function types** before a named consumer exists. Rust's keyword-generics
  experience is the warning, and VL's F-C "reserve, don't build" is the right call.
- **Setters**, on any receiver.
