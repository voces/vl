# Persona review: `swift`, a senior Swift developer who follows Swift Evolution

**Who I am.** I have written Swift since 1.2. I have shipped SIMD-heavy rendering code on
`SIMD4<Float>`, and I have debugged the performance cliffs that computed properties, protocol
existentials and resilient (library-evolution) types create. I value three things. Value
semantics should be predictable. The cost of dynamic dispatch should be visible in the spelling:
this is the whole point of SE-0335's `any`. And a property should read like data. Swift's API
Design Guidelines only ask authors to *"document the complexity of any computed property that is
not O(1)"*, and Swift's own stdlib breaks that expectation. I judge VL's getters by whether they
avoid the traps Swift walked into, and whether they lose the ergonomics that made Swift pleasant.

Every probe below is in `persona-review/swift/` and was run with `dist/vl` on master `31ea77721`.

---

## Q1. Should the body contract be a hard error? **Agree: keep it an error. Fix the over-strict parts before debating severity.**

- **The comparison as the brief frames it is off.** The contract does not refuse a program. It
  refuses a *spelling*. Every refused getter is still available as a method: `v.full()` instead
  of `v.full`. So "VL refuses nothing else purely for performance" is not the right comparison.
  B6 already reserves parenless syntax for O(1) members, and the contract is B6 made checkable.
  What the user gives up is the chance to lie about cost, not a capability.
- **Swift is the evidence that guidance fails.** The guideline says to document a non-O(1)
  computed property, and the stdlib still ships `String.count`, which is O(n) and walks grapheme
  clusters. `for i in 0..<s.count` inside a loop that also calls `s.count` is a classic
  quadratic. `LazyFilterCollection.count` is O(n) too, and `Dictionary.values` has a similar
  story. They are O(n) *because a protocol requirement (`Collection.count`) forced a property
  spelling on every conformer*. Guidance did not survive contact with conformance. If VL ever
  lets getters satisfy contracts (Q4), a warning-level contract recreates this exact hole.
- **Against the split "error for std, warning for users".** It creates two dialects, the way
  Swift's library-evolution mode did: `@frozen`, and `@unknown default` becoming required in
  resilient builds. A user getter moved into std, or copied from std into user code, changes
  whether it compiles. One language, one rule.
- **Against per-site suppression (`// vl-allow getter-cost`).** Suppression sits at the
  *declaration*, and the surprise happens at the *use*. A reader of `v.x` in a hot loop never
  sees the comment. If an author wants an arbitrary body, the escape hatch already exists and it
  is visible at the call site: `()`.
- **The real risk is an over-strict error, which pushes people to demand a warning.** Finding 1
  below is the example: `sqrt` is refused. Remove false refusals fast, and the severity question
  goes quiet.

## Q2. Constant-bounded loops, budget 64. **Agree that the invariant is a sufficient stopping rule. Modify: the ruled form has no working consumer.**

- "Worst-case cost is computable from source and never data-dependent" is a *category* line, not
  a number line, so it is a real stopping rule. The slope the owner fears could only come from
  the budget number, and the budget moves only through `DECISIONS.md` plus a std review. That is
  enough.
- **But the motivating example does not compile** (`swift/p1.vl`):
  ```vl
  for i in 0 until 4 { s = s + v.lane(i) }   // argument 1: expected Lane4, got i32
  ```
  The loop variable is an `i32`. `lane` takes `Lane4`, and the intrinsic needs a literal. So the
  "four-lane reduction written as `for i in 0 until 4`" that §D3a-contract tier 2 cites is not
  expressible over SIMD. **Suggestion:** type a constant range's loop variable as the literal
  union of the values it visits (`0 | 1 | 2 | 3`), so that `lane(i)` checks and folds after
  unrolling. Without that, the amendment admits loops that nobody's getter can use.
- **Name the unit honestly.** Straight-line code is `Bounded(0)` whatever its length, so 64 is a
  budget on *loop trips*, not on work. That is fine, but the diagnostics and docs should say
  "iterations", never "cost".
- **Swift culture draws the line differently.** Reductions are *methods*: `SIMD.sum()`, `.max()`
  and `wrappedSum()`. A reduction is a verb. I would not add loops for reductions. I would add
  them only for things that are nouns, such as a packed-field decode over N sub-fields.

## Q3. Setters. **Agree: none now. Disagree with narrowing to "none on value types, some on reference types". If setters ever come, they are value-type write-back.**

- Swift did not fix C#'s CS1612 by banning value-type setters. It used **write-back**:
  `v.x = 1` on a `var v` is `get`, then mutate, then `set` on an inout `self`, and
  `particles[i].pos.y -= g` composes through every level. `_modify` coroutines (now pitched as
  `yielding mutate`) exist only to make that in-place. The **value-type case is where setters
  pay off.**
- For VL, `F32x4` already has the setter's body: `withLane`. A future
  `v.x = 1.0` could desugar to `v = v.withLane(0, 1.0)` when `v` is an assignable place (a `let`
  local, a field, an element). That gives `v.x += dt` for free. Nested paths need Swift's
  get/modify/set chain, and some exclusivity story (SE-0176) once aliasing matters. That is a
  real feature, and it should be ruled *as that shape* so that nobody builds the other one first.
- A reference-type setter is the *least* valuable form. It is method sugar that makes a field
  write run hidden code, which the whole design otherwise avoids. `readonly` fields plus
  `setX(v)` cover validation honestly.
- Today's refusal message is good: `cannot assign to .x: it reads the getter x on F32x4, and a
  getter is read-only` (`swift/p2.vl`).

## Q4. Getters and structural contracts. **Agree: rule `{ readonly x: f32 }` now. Modify: it is more urgent than "later", and it must be specialised-only, the way Swift's `some` is.**

- Swift's `var x: Float { get }` requirement is exactly F5. Any stored `let`/`var` or computed
  property satisfies it. `{ get set }` requires settable storage. Mapping read-only to getters is
  proven design.
- **Swift's cost lesson is `some` against `any`.** A generic `<T: P>` is specialised and free.
  `any P` is a 3-word existential buffer plus metadata plus a witness-table call per access, and
  Swift spent five years (SE-0309, SE-0335) making that cost *visible in the spelling*. VL should
  not reinvent the invisible form. Admit a getter to `{ readonly x }` only at **specialised**
  positions: a bound `<T: { readonly x: f32 }>` or an un-annotated parameter. At an *annotated*
  parameter, field or list element, refuse with "use a type parameter". Never silently build an
  adaptor. If VL ever wants the dynamic form, it gets its own spelling.
- **It is urgent because today no bound reaches a getter type at all.** The guide says that
  generic code wanting a readable `x` "asks for the method `{ x(): f32 }` instead". That does not
  work either (`swift/p9.vl`, `swift/p12.vl`):
  ```
  F32x4 does not satisfy `{x():f32}`: no `x(): f32` — the bound needs a field of that type or a
  `x(self: F32x4, …)` function in scope at this call
  ```
  So a `Color` with `.r` is unreachable from *any* generic code. Swift never had that gap:
  `{ get }` always existed.
- A `{ readonly x }` read in a generic body must be uniformly non-narrowing (Kotlin's rule),
  because an instance might be a getter. And it is safe only because Q1 stays an error: a
  contract that a getter can satisfy inherits the getter's O(1) promise. This is the
  `String.count` lesson again.

## Q5. Getter-eligible is not `pure`. **Agree. Modify one rationale.**

- This is LLVM's `readonly` against `readnone`, which Swift exposes internally as
  `@_effects(readonly)` and `@_effects(readnone)`. A getter is "readonly plus cheap", and
  `pure` is "no effects, restricted reads". They are separate axes, correctly kept apart.
- The stated rationale, "a getter describes its receiver, so no module `let`", is not what the
  rule enforces. It admits **all** linear memory (`__load_i32__(0)` is global state) and the
  heap of a module `const` (`const LUT = [...]` can be mutated with `LUT[0] = 99`, and the getter
  then gives two answers for one receiver). Say what the rule is: *no reads of a named, mutable
  module binding*. Keep it, because it is cheap and catches the common global-config getter
  (Swift's `var isDark: Bool { UserDefaults… }` anti-pattern). But do not claim it guarantees the
  same answer for the same receiver.

## Q6. The effects summary. **Agree with the shape. Modify: three missing facts, and one warning.**

- Inferred, per instance, never in a type: yes. Swift is the cautionary tale for effects in
  types. `async` colouring created two worlds of APIs. `rethrows` was too narrow, which led to
  typed throws (SE-0413) and a pitched `reasync`. Keeping VL's summary out of types, with one
  checked `pure` marker, is the right call.
- **Missing: an escape fact per function-typed parameter.** F-A+ (Nim's rule) charges a
  callback's effects to the call site that passes it. That is sound **only if the callee does
  not store the callback**. `function onTick(f) { handlers.push(f) }` would be charged "pure" at
  the call site, and then `f` runs later, somewhere else. Swift made closures **non-escaping by
  default** (SE-0103) precisely so that `rethrows` and closure optimisation are sound. Record
  `escapes(param)`, and apply A+ only to non-escaping parameters.
- **Missing: where a `pure` generic's error lands.** `pure function f<T: { x(): f32 }>(t: T)`
  is pure at one pin and impure at another (a `self`-function that writes). Per-instance
  checking reports that *at the pin*, which is the check-reject audit's "refusal lost at the
  pin" class, created on purpose. Swift checks a generic body once, against its requirements.
  VL can't, without effects in bounds. So rule it now: either `pure` on a generic whose bounds
  name methods is refused, or the pin error names the declaration and the offending
  instantiation.
- **Warning: the `S` (may-suspend) bit must not stay inference-only if suspension becomes
  observable.** Swift puts `await` at every suspension point because suspension is a *semantic*
  event (reentrancy, interleaving, actor hops), not a cost. An invisible inferred "may suspend"
  is the one effect I would *not* keep out of the source.
- Nothing is excessive. `U` reserved at zero is free. `T` is optimizer-only, which is correct.
  The `R.heap` root class earns its place through hoisting (§G2).

---

## Findings beyond Q1–Q6, ranked

1. **The single-instruction prelude math is refused in a getter body.** `sqrt`, `abs`, `floor`
   and `min` each lower to one wasm op (`f64.sqrt`, `f64.abs`, `f64.floor` and `f64.min`,
   disassembled in `swift/p14.vl`). All four are refused as "neither a pure intrinsic nor a
   getter" (`swift/p13.vl`, `swift/p5.vl`). So the canonical computed property in *The Swift
   Programming Language*, `var length: Double { (x*x + y*y).squareRoot() }`, cannot be written.
   `hypotF64` and `dot` are refused too. Add the prelude's single-op math to the intrinsic list
   now. It is a relaxation, the allowed direction, and it does not have to wait for the effects
   summary.
2. **No structural bound admits a getter type** (Q4, `swift/p9.vl`, `swift/p12.vl`). The
   guide's documented workaround `{ x(): f32 }` is refused for `F32x4`, and the refusal still
   offers the false fix "or a `x(self: …)` function in scope" (the G3 message, now wrong for a
   second reason). Fix the guide sentence today. `{ readonly x }` is the only real fix.
3. **The loop amendment's headline use does not type-check** (Q2, `swift/p1.vl`). Type a
   constant range's variable as its literal union, or drop the reduction from the examples.
4. **No retroactive getters, and Swift users will miss them most.** The most common Swift
   computed property I have written is a *user-side extension on a library type*:
   `extension SIMD4 where Scalar == Float { var xyz: SIMD3<Float> {…}; var length: Float {…} }`.
   In VL, `get len2(self: F32x4)` outside `std:simd` is refused by the orphan rule
   (`swift/p11.vl`), although a user `function len2(self: F32x4)` is allowed. So users get
   swizzles and lengths only as methods, which gives a type two spellings for nouns: `v.x` but
   `v.xy()`. That may be the right price for D1984 immunity. But rule it *explicitly*, and say
   in the guide "user code adds methods, not getters, to std types". Otherwise the first
   graphics user files it as a bug.
5. **Optional-returning getters are refused, and they are the most common computed property in
   Swift.** `Array.first`, `.last` and `min()` all return `Element?`. In VL,
   `get top(self: Stack): f32 | null` is refused because the rep boxes (`swift/p6.vl`). The rule
   leaks a representation choice into the surface language, which the effects doc (§C3)
   explicitly refuses to do for `A`. The two docs disagree: the getter doc judges allocation on
   the rep (F9(a)), and the effects doc judges it on the source with a hint. Reconcile them
   toward the effects doc. `f32 | null` from a getter is a candidate for the first relaxation.
6. **Duplicate diagnostic.** `swift/p8.vl` (string `+` in a getter) prints the same "concatenates
   strings" error twice at `3:32`. It is minor, but it is the kind of thing that makes a hard
   error feel hostile.
7. **A small learnability trap, and the design gets it right.** The rule "no method of the same
   name" (`v.f` beside `f(self, k)`) matches Swift, where a property and a method may not share a
   base name in one type, and the message is clear. Keep it.

---

## What I would adopt from Swift

- **`{ get }` against `{ get set }` in requirements**, as `{ readonly x: T }` against
  `{ x: T }` (F5). It is proven, and it is the only honest way for getters and structure to
  meet.
- **`some` against `any`**: a getter satisfies a contract only where the code is specialised,
  and anything dynamic has its own spelling.
- **Write-back setters derived from a `with` function**, if setters ever come: the value-type
  `v.x += 1` that makes `SIMD4` pleasant in Swift.
- **Closures non-escaping by default**, or at least an inferred escape fact, before shipping
  Nim's rule.
- **SIMD4 lanes as ordinary library properties**, not compiler magic. VL already did this, and
  it is the right call (D2 was correctly rejected).

## What I would warn VL away from

- **Silent existential adaptors** at annotated structural positions. They are Swift's biggest
  performance cliff, and Swift took years to make them visible.
- **A dialect split** (error in std, warning for users). Library-evolution mode showed the cost
  of two rule sets for one language.
- **`mutating get` and `lazy var`**, meaning a getter that caches by writing. VL's no-write rule
  is right. Caching belongs in a method.
- **`get async throws` (SE-0310).** It fits Swift, where property syntax is used for everything.
  In VL an effectful read is a method, and the contract says so.
- **`_read`/`_modify` coroutine accessors** before the language has a need for in-place mutation
  of borrowed storage. They are powerful, and they are also where Swift's accessor model became
  expert-only.
