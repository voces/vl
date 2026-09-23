# Persona review: the optimizing-compiler engineer

**Who I am.** I have worked on LLVM's `FunctionAttrs`/`memory(...)` inference, GCC's `ipa-pure-const`
and modref, binaryen's `EffectAnalyzer`, and V8's operator properties. I judge a language rule by
three questions. Does the compiler actually *use* the guarantee? Is the analysis that enforces it
sound against the lowering the emitter really performs, rather than the one the source suggests? And
can it be built on this compiler's data structures without a second copy of the truth? I would rather
have a small checked fact the optimizer relies on than a big one that only a lint reads.

All probes are in `persona-review/compiler-engineer/p/`. I ran them with `dist/vl` at `31ea77721`
(which includes #3031) and disassembled with `node_modules/.bin/wasm-dis`.

---

## Q1. Should the body contract be a hard error? **Modify: split it. Make effects an error and cost a lint.**

The contract bundles two kinds of rule, and they deserve different treatment:

- **The semantic half**: effect-free (no `W`, no `H`, no `X`), no module-`let` read, and terminating.
  The compiler *can* rely on this half. If a getter read is effect-free and terminating, then a `v.x`
  can stay a `Member` node that `exprEffectFree` admits (D1510's reorder), that `unionEqOperandOk`
  may re-read, and possibly one that narrows like a field path (see finding 7). That is the same
  role as LLVM's `readonly willreturn`: it licenses transformations. A guarantee that licenses a
  transformation has to be an error, because a lint the user silenced would turn into a miscompile.
- **The cost half**: the loop budget, the allocation ban and the non-boxing rep rule. No pass
  consumes it. It is the "would we feel bad in a loop" test, and the brief is right that VL refuses
  nothing else on performance grounds. A cost rule the optimizer never reads belongs in
  `-Wsuggest-attribute`-style territory: a warning by default, an error for std exports (the std
  baseline in effects §E4 already has that shape).

The catch is that **today the compiler uses neither half.** `getterRewriteSites`
(`typecheck.vl:37107`) rewrites every getter read into a `Call` before emit, so `exprEffectFree`
answers false. Effects §A4 admits this: getter reads pay D1510's stash and are refused as union
re-read operands. As built, the hard error buys the compiler nothing. It becomes worth keeping only
once the emitter lowers the `Member` itself and trusts the contract (finding 6).

On suppression: put the escape on the **declaration** (`// vl-allow getter-cost` above `get x`),
not at use sites. Cost is a property of the body, and a use-site suppression would have to be
repeated at every `.x`.

## Q2. Constant-bounded loops, budget 64. **Agree with the invariant. The metric is wrong, and v1 is already unbounded.**

"Worst-case cost computable at compile time, never data-dependent" is a good stopping rule, and it
has real precedent the docs miss. The eBPF verifier admits bounded loops against a fixed
instruction-complexity limit. HLSL/Metal `[unroll]` requires a compile-time trip count. WGSL forbids
recursion so that the call graph stays acyclic. None of them is a mainstream getter, but all of them
are checked cost contracts that have shipped, so the invariant is not a slippery slope.

**But the budget counts loop iterations, and it should count work.** Straight-line code is
`Bounded(0)` (effects §C1a), and a call adds only its callee's bound. So a getter DAG costs nothing
by that measure, while the actual work doubles at every level:

```vl
type C = new i32
get g0(self: C): i32 { (self as! i32) & 1 }
get g1(self: C): i32 { self.g0 + self.g0 }
// … g2 … g31, each reading the previous one twice
print((3 as! C).g31)
```

`vl check` is clean under the **shipped v1 "loop-free" contract**. One `.g31` makes 2³¹ calls and
takes **4.4 s** (`dag31.vl`; each `g_k` is two `call`s to `g_{k-1}` in the wasm). The amended
formula scores it `Bounded(0)`.

The fix is a static WCET computed over structured control flow, in work units:

- `cost(seq) = Σ`, `cost(if/match) = max over arms`, `cost(loop) = trips × cost(body)`;
- `cost(call) = 1 + cost(callee)`, with each operator weighted from the helper table.

Budget that single number. Then loops stop being a special case: they are one term in the formula,
and the "slope" ends at one number.

This also fixes a second inconsistency. The §C1a formula **sums** loops across exclusive branches,
so `if c { 40-trip loop } else { 40-trip loop }` scores 80 and is refused. The owner's tier
definition says "costed by the longest path", which gives 40. The formula should take a `max` at
joins.

## Q3. Setters. **Agree: none. Narrow the wording, but do not build them for reference types either.**

For value types, CS1612 and Swift's `modify` accessors settle the question. For reference-backed
nominal types, a setter does lower trivially (`Assign(Member)` becomes `Call(x=, obj, v)`). The
design problem is elsewhere:

1. **A setter is only useful for validation, and validation needs the stored field to be
   unwritable.** VL has no private or readonly fields, so `v._x = bad` bypasses any setter. That is
   the same argument the doc makes against getters-as-encapsulation (§E2), and it applies here with
   more force.
2. **Compound assignment becomes get-then-set.** `a[f()].x += 1` then needs a receiver temporary to
   keep source order, which is D1510's class again. It also adds another delivery position to
   every assignment arm (`emitAssign`, its global-set arm, compound ops), and that is the
   position-matrix risk CLAUDE.md documents.

So the right wording is "none. Revisit for reference types only after `readonly` fields exist, and
only as sugar for a method call." Nothing should be built now.

## Q4. Getters satisfying `{readonly x: f32}`. **Agree with "rule now, build later". It costs more than "no dynamic cost".**

Monomorphization makes the *runtime* cost zero. The engineering cost comes in three pieces, and the
doc names none of them:

1. **Un-annotated positions are already constraint-checked, not merely specialised.**
   `function getx(p) { return p.x }` infers the row `{x: _}`, and passing a getter-backed `V` is
   refused at the call: `argument 1: expected {x: _}, got V` (`q4b.vl`). So Q4 at "specialised"
   positions requires the **inferred row to carry an access mode per member**. That mode is
   **interprocedural**: in `function f(p) { g(p) }`, where `g` writes `p.x`, `f`'s row must be
   writable. The analysis Q4 needs is therefore a per-parameter write summary, which is LLVM's
   per-argument `readonly`. Effects §B2 finding 5 defers exactly that split as "only an optimizer
   would need it". **Q4 would need it for acceptance.** The two docs should cross-reference this, or
   Q4 will arrive needing a second analysis.
2. **The lowering must move to emit time, per instance.** `monoCloneBody` shares leaf nodes between
   instances copy-on-write (`emit_mono.vl:3745`, "shares the body wholesale"). A `p.x` node that is a
   `struct.get` in the `P` instance and a getter call in the `V` instance cannot be rewritten in
   place the way `getterRewriteSites` does it. The emitter's `Member` arm has to consult the
   instance's receiver type. There is precedent: `flatMemberFold`'s `fl == 3`, where the layout
   member "stays a `Member`" and "the monomorphizer supplies [it] per instance".
3. **Annotated structural parameters are not specialised today.** They are a concrete WasmGC
   layout, and width subtyping is refused. The cheapest way to cover annotated `{readonly x: f32}`
   is to **treat every structural-typed parameter as an implicit type parameter**, a mono key. That
   would also retire the "type-valid but not yet supported by codegen" width refusal (§A1 probe 3).
   Positions that really are heterogeneous (a `{readonly x}[]`, a struct field, a function-typed
   parameter) need a witness: `{anyref obj, funcref getx}`, which is Go's interface representation.
   Refuse those loudly and permanently until a consumer exists.

## Q5. Getter-eligible is not `pure`. **Agree.**

In optimizer vocabulary:

- getter-eligible ≈ `memory(read) willreturn` plus no allocation;
- `pure` ≈ `memory(argmem: read)` with no cost claim.

They are incomparable, and every IR I know keeps them apart. That is correct. One refinement: the
getter's "describes its receiver" rationale would be *checkable* for `R.heap` if roots were tracked
(`param` against `const`, both of which are admitted). `R.mem` is the honest hole, and the doc says
so.

## Q6. The effects summary. **Agree with the shape. Modify where it is computed and how it is keyed. Fix `hoistable`.**

The bits match what LLVM, GCC and binaryen found worth keeping: location-split reads, a separate
termination fact, and reserved unwind. Dropping `nofree` and `nosync` is right. My objections are
about implementation:

- **The checker has no instances.** §C3/§C4 say the summary is computed "in the checker, over the
  typed AST, per pinned instance", keyed by "the same identity the emitter's instance table uses".
  But:
  - `nodeTyIx` is one type per node (`typecheck.vl:2884`), so a generic body carries `TyVar`s;
  - instances are minted in `emit_mono.vl` from pin *names* (`monoArgPinName`, originally
    `(name, wasmParamTypes…)`);
  - the instance call graph exists only after mono.

  Keying acceptance on the emitter's table makes acceptance depend on rep, which is exactly what
  §C3 rejects for allocation.

  **Alternative:** compute one summary per *declaration* in the checker, as concrete facts plus
  **residual obligations** over the type parameters and function-typed parameters: "`==` at `T`",
  "calls parameter 2". At each checked call site, resolve the residuals against the pin (from the
  operator cost table) or against the argument (Nim's rule). Generics and F-A+ then become one
  mechanism. SCCs run over declarations, which the checker has (`fnDeclIx`), and no per-instance
  body walk is needed. This is how Rust's `~const` trait bounds and Koka's row variables achieve the
  same thing. Full per-instance summaries can stay optimizer-only and emitter-side.
- **`hoistable` omits ¬A.** Hoisting or CSE-ing `mk()` out of a loop replaces N fresh objects with
  one shared object. Structs are references and can be mutated, so that is observable. Every
  optimizer treats allocation identity as a barrier to CSE (LLVM's `noalias` return; the
  `CSE`/`GVN` handling of `malloc`-like calls). Add ¬A, or at least "the result does not escape and
  is not mutated".
- **The operator cost table must be checked against the emitter, not written beside it.** See
  finding 2: the hand-written table has already drifted.
- **Scale:** an SCC pass over roughly 6k declarations is trivial. The D1090 warning (memoise per
  key, and add a scaling-shape pair) is the right one. Note that the shipped cycle check
  `getterReaches` runs a BFS per getter over the entire edge list (`O(G²·E)`). Replace it with the
  same Tarjan pass the summary needs.

---

## Findings beyond Q1–Q6 (ranked)

**1. "Bounded" is not bounded: a getter DAG costs 2ⁿ (clause-1-shaped for the perf contract).**
`dag31.vl` is described under Q2 above: 32 contract-clean getters, and one `.g31` read takes
4.4 s. The contract's headline promise ("a getter read costs a load or a short bounded sequence",
DECISIONS and the guide) is false today. The fix is the WCET metric, where each call counts at
least 1. It should land with the loop amendment, because the amendment makes the transitive bound
the load-bearing number.

**2. `is "literal"` over a string hides a `__str_eq__` loop, and the walk cannot see it.**

```vl
type N = new { name: string, k: i32 }
get isZ(self: N): boolean { self.name is "z" || self.name is "y" }
```

This passes the contract, and the wasm of `N.isZ` is two `call $__str_eq__`, a two-loop helper
(`h2.vl`, `h8.vl`). `gwWalk`'s `IsExpr` arm only walks `isObj`. The root cause is structural. The
walk is an allow-by-node-kind list with a hand-maintained deny-by-operand-type table, written
*beside* the emitter's lowering rather than derived from it. It is the fourth hand-written "no
effect" predicate, after `exprEffectFree`, `unionEqOperandOk` and `upeIsPure`.

**Recommendation:** keep the checker rule for acceptance, but add a **compiler self-check** in the
test/fixpoint path. For every getter instance the emitter produces, assert that its body contains
no `loop`, no `struct.new`/`array.new*`, and no `call` to a helper outside a leaf list. That is
effects option (b), used as an *invariant assertion on the compiler* rather than a user-facing rule,
which keeps acceptance rep-independent while catching drift the first time a fixture hits it.

**3. The getter intrinsic allow-list is a stale duplicate. `sqrt`, `abs`, `min`, `clz`, `popcnt` and
`f32fromBits` are all refused.**

```vl
type V2 = new { x: f64, y: f64 }
get len(self: V2): f64 { sqrt(self.x * self.x + self.y * self.y) }
```

This is refused with `calls sqrt, which is neither a pure intrinsic nor a getter` (`h4.vl`, `h9.vl`).
`sqrt` lowers to the single opcode `f64.sqrt` (`wasmEmit.vl:14270`). The *message is false*: `clz`
is a pure intrinsic. The magnitude getter is the canonical getter in every vector library, and a
packed `Color` wants `popcnt`/`rotl`. `getterIntrinsics` (`typecheck.vl:36528`) should consult the
existing `isNumIntrinsicName` (`:23169`) rather than list names again. This is DRY and a
correctness fix in one edit.

**4. Acceptance keyed on the emitter's instance identity would be rep-dependent.** This is covered
under Q6. It is ranked here because it is the one place where the effects doc's own principle ("the
inference that decides ACCEPTANCE must be local and stable") is contradicted by its implementation
plan.

**5. `hoistable` omits ¬A.** See Q6. It is a soundness bug in a table that an optimizer author will
copy literally.

**6. The pre-emit `Member`→`Call` rewrite throws away what the contract bought.** The contract
proves effect-free and terminating, and then the rewrite hides that proof from `exprEffectFree`.
It also blocks Q4, because a shared mono node cannot be rewritten per instance, and it forces an
`arenaEpochBump` so that lint re-parses. **Lower the getter in the emitter's `Member` arm instead**
(the precedent is flat layout members), and let `exprEffectFree` keep answering true. This is the
change that makes Q1's hard error pay for itself.

**7. An opportunity the contract creates: getter paths could narrow.** Kotlin refuses smart casts
through custom getters because the getter's body is arbitrary. VL's is not. A getter that is
effect-free, reads no `let`, and reads only `self`-rooted heap plus memory is invalidated by exactly
the events that invalidate a field path, plus any linear-memory store or call. I would **not** build
this now (`const p = v.p` is a fine idiom). But it is the second transformation, after reordering,
that the semantic half of the contract licenses, and it is a reason to keep that half an error.

---

## Adopt, and warn away

**Adopt:**

- LLVM's `memory(argmem|other)` plus `willreturn` as the mental model. The summary already
  approximates it; say so, and borrow the names in docs.
- GCC `ipa-pure-const`'s separate `looping` flag. The doc already has it as `B`.
- A static-WCET budget over structured control flow, eBPF-verifier style, in place of
  iteration-counting.
- A release-profile measurement of binaryen `--generate-global-effects --licm`, before building any
  VL-side hoist (effects §A5 shows `popcnt(k)` stays in the loop). It is free inference that decides
  nothing.
- Swift's `{ get }` for F5, spelled `{ readonly x }`.

**Warn away from:**

- Acceptance that reads the emitter's instance table or binaryen's facts. Any rule that flips when
  a rep campaign lands is a clause-2 generator.
- A fifth hand-written "is this cheap/pure" predicate. Derive them all from the one summary, and
  check that summary against emitted wasm in tests.
- TypeScript's `readonly`-ignored assignability, which is already rightly rejected.
- D's attribute soup: one contextual `pure`, and nothing else in source.
- C23/GCC-style unchecked attributes, even on externs, until an optimizer actually consumes them.
