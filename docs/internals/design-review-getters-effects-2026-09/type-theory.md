# Getters and effects, from the type-theory chair

## Persona

I work on programming languages and write functional code. My reference points are Koka's effect
rows, OCaml 5's untyped handlers, Haskell's purity, Idris and Lean totality, and the record
calculi: width and depth subtyping, and why a *mutable* field has to be invariant. I judge a
design by whether the judgement it adds is sound (`accepted ⇒ does not go wrong`), whether it
composes (sequencing, nesting, calls, instantiation), and whether its words mean what the
literature means by them. I prefer a small rule with a clear model to a long list of cases.

Probes are in `persona-review/type-theory/` (`p1`–`p10`) and were run with `dist/vl` on the
current checkout. Documents read: property-access at the #3039 head, function-effects at the
#3023 head, `docs/guide/getters.md`, and the relevant parts of `compiler/typecheck.vl`.

---

## The six open questions

### Q1. Should the body contract be a hard error? **Modify: split it by what each half buys.**

The brief frames the contract as a performance rule, and a performance rule alone would
indeed be lint-shaped. But half of the contract is not about performance. It is what makes a
getter read an **observation**: a deterministic function of the receiver's reachable state and
the constants, with no effect. Other rules depend on that:

- **Reordering and CSE.** Two effect-free, terminating reads of `v.x` can be swapped or merged.
  D1510's `exprEffectFree` and the effects doc's §G1 depend on exactly this.
- **Narrowing.** Because the contract makes a getter deterministic, a getter path can be
  narrowed under the *same* invalidation rule as a field path, plus linear-memory stores (see
  Q5). Kotlin refuses smart casts through custom getters because Kotlin cannot know what a
  getter does. VL's checker can know.
- **Termination.** The effects doc's own §G1 example, `{ b: spin(), a: xs[99] }`, shows that
  divergence is observable under reordering.

My proposal:

- **Semantic half, an ERROR everywhere:** effect-free (¬W ¬H ¬X), no `R.let`, and `Bounded(n)`
  for some `n`, meaning the invariant holds.
- **Cost half, a WARNING for user code and an ERROR for std exports:** ¬A, and `n ≤ 64`.

This is how Idris handles totality: checked where you ask for it, with the declaration as the
unit of opt-out. Here the `get` keyword is the request. Any suppression should attach to the
*declaration*, because that is where the diagnostic lands. It should not become a general
per-site suppression mechanism added for this one rule.

If the semantic half also becomes a lint, the getter is a C#/Python property. It then loses
reordering, CSE and narrowing, and the "a `.` is a load" story no longer has a checked basis.

### Q2. Constant-bounded loops, and whether the invariant is a stopping rule. **Agree with the invariant. The formula has a hole, and the invariant's two halves disagree on one case.**

The invariant is a good stopping rule. Its programs are those with literal trip counts, so it
is decidable, syntactic and compositional: cost forms a semiring, where sequencing adds and
nesting multiplies. WGSL's constant loops and Zig's comptime quota occupy the same space.
Nothing in it slides toward "loops over data".

**But the §C1a formula bounds loop iterations, not work, and a loop-free call DAG escapes it.**
In the formula, straight-line code is `Bounded(0)` and a call contributes `bound(callee)`. So
`bound(g0)` is 0 below:

```vl
type N = new i32
get g0(self: N): i32 { return self.g1 + self.g1 }
get g1(self: N): i32 { return self.g2 + self.g2 }
// … 31 levels …
get g31(self: N): i32 { return (self as i32) & 1 }
print((3 as N).g0)
```

On the current build this 33-line program passes `vl check` (probe `p10`). **One `.g0` read
costs 3.54 s: 2³¹ calls, no loop anywhere.** The v1 loop-free contract has the same hole. The
getter test ("would we feel bad about `v.x` in a loop?") fails on a program that the contract
labels tier 2.

**Fix:** count each call as work: `… + Σ calls c: (1 + bound(callee(c))) × Π trips(enclosing)`.
At a budget of 64, this refuses the chain at depth 6. The same fix applies to the std baseline.
It must record this measure, or a std export can raise a user getter's cost while its recorded
bound stays 0.

**The two halves of the invariant disagree about a refinement bound.** Take
`for k in 0 until i` with `i: 0 | 1 | 2 | 3`, the `Lane4` shape std already ships. Its worst
case *is* computable at compile time (3), but the trip count is data-dependent. The doc says
both "computable at compile time" and "never data-dependent", and this loop satisfies the first
and violates the second. It is also the next request anyone will make, because it is how you
write "first *i* lanes". Rule which half governs now. I would keep "never data-dependent",
because it keeps the rule syntactic, and put the refinement case in the "never" list by name.
Two smaller gaps also need a line each: a `to` range whose step points away from its end
(`0 to 3 step -1` has 0 trips), and I13's definition of which `const`s count.

### Q3. Setters. **Agree with F7. If they are ever narrowed to reference types, they must not take part in assignment narrowing.**

A setter is half of a lens, and the lens laws are what make `o.x = v` behave like field
assignment. The one that matters is PutGet: after `o.x = v`, `o.x` reads `v`. VL's checker
depends on PutGet today. `writeReNarrowTy` (`typecheck.vl`) re-narrows a place to the written
value's member after an assignment. A validating setter (clamp, or "null means reset to a
default") breaks PutGet. With it, `o.v = s; o.v.length` would be accepted on a narrowing the
setter falsified.

So "setters on reference types" is not just "a method with assignment syntax". It needs one of
two things:

- (a) exclude setter places from assignment narrowing and from compound assignment (`+=`
  desugars to get then set, which is CS1612's shape again on a nested value);
- (b) check the lens laws, which no language does.

With `readonly` fields plus methods covering the reference-type case, "none" is the cheaper
design. Narrowing it to "none on value types" is harmless as a wording change, but it should
not be read as a plan.

### Q4. Getters satisfying `{ readonly x: T }`. **Modify: yes, as a bound first. And the depth-variance rule under it is currently broken.**

These are the calculus rules F5 needs. Only the second half of each exists today.

1. `{ x: T } <: { readonly x: T }`, and **never the reverse**. This is TypeScript #13347:
   `readonly` that does not affect assignability is decoration, not a type.
2. **`readonly` fields are covariant in depth, and mutable fields are invariant.** This is the
   same rule VL ruled for lists on 2026-09-06 (`readonly T[]` covariant, `T[]` invariant,
   D1686/D1687). **Records do not follow it today** (Finding 1 below): a mutable field is
   accepted covariantly, and the program fails after `vl check` passes.
3. `readonly` means *read permission*, not *immutable*. A `{ readonly x }` view of a mutable
   field can change through an alias. So narrowing through a readonly path must use the same
   invalidation as a field path, with no special exemption.
4. **Coherence is already guaranteed.** Getters are found through `homeModuleOf` under the
   orphan rule, so each `(type, name)` has at most one witness. Scala's implicits and
   Haskell's orphan instances are the counter-examples, and VL avoided them.

On representation: at a specialised position, a getter satisfying a readonly bound is
dictionary passing that monomorphization has removed, as with GHC's `SPECIALIZE`. At an
annotated, non-specialised position, the value is an existential package `∃S. S × (S → T)`,
which is a Swift protocol existential or a Rust `dyn`. My recommendation:

- **v1: `{ readonly x: T }` is a bound-only form** (`<U: { readonly x: T }>` and un-annotated
  inference), like Rust's `impl Trait` in argument position. Using it as an annotated value
  type with a getter-backed argument is a **checker** refusal that names the missing existential.
  It must not become an emitter floor, which would repeat §C2's positional-split defect.
- **A useful special case:** a *snapshot* coercion (materialise `{ x: v.x }`) is observationally
  equal to a live read exactly when the getter reads nothing mutable, that is ¬`R.heap` ∧
  ¬`R.mem`. That holds for every `F32x4` lane getter, whose receiver is an immutable `v128`.
  This is a legitimate place for the effect summary to decide a coercion, and it is local,
  because it reads the getter's own body. A flat-row getter (`__load_*`) fails the test, and so
  it must get a live witness, not a snapshot.

### Q5. Getter-eligible is not `pure`. **Agree. Name the lattice, and fix the survey's claim about Koka.**

Both predicates refine *effect-free*, and they are incomparable:

- `pure` drops the reads of ambient state and keeps unbounded cost;
- getter-eligible keeps receiver and memory reads and drops cost.

That is the correct shape. In the literature, getter-eligible is closest to Solidity's `view`
plus a cost bound: an *observer*. It is **deterministic given the store fragment it reads**, and
that is the fact Q1 and Q4 use.

One correction to the doc. §E2 says Koka's `pure` "means the same thing". It does not for
reads. In Koka, reading a `ref` is the `read<h>` effect inside `st<h>`, so a Koka `pure`
function cannot read mutable heap at all. VL's `pure` admits `R.heap[param]`, so it is Fortran
`PURE` or D's *weak* `pure`, and it is not referentially transparent across a mutation of its
argument. That is fine for compile-time evaluation and for workers, which is what the doc
justifies it by. Cite Fortran and D, not Koka, or a Haskell-trained reader will assume
`f(p) == f(p)` holds across `p.x = …`.

### Q6. The summary's shape. **Agree with the architecture. Four corrections.**

The architecture is sound: a latent effect summary inferred bottom-up over SCCs, kept out of
types, pessimistic at unknown calls, with one checked marker at the boundary. It is Flambda's
or GCC `ipa-pure-const`'s summary, with D's "infer where the body is visible" policy. An
unannotated function type meaning "unknown effects" forever is the correct one-way door. OCaml 5
is the warning on the other side: untyped effects surface as runtime failures. VL avoids that
because *unknown means pessimistic*, not *unknown means permitted*.

The corrections, detailed in Findings 3 to 6:

- the checker **already has** an interprocedural write-effect analysis, and it already decides
  acceptance;
- the freshness rule is unsound on nested paths;
- `hoistable` omits ¬A;
- per-instance acceptance of `pure` on a generic is non-local.

On Nim's rule (F-A+): it is a restricted row polymorphism. The "effects via parameter k"
entries are row variables that are only ever instantiated at call sites. It is sound if:

- **forwarding** is handled (`map(xs, f)` passing `f` on to `each(xs, f)` must propagate the
  parameter entry, not set `X`);
- a parameter that **escapes** (is stored) makes later calls through the stored value `X`, as
  (A) already does.

State both in the doc.

---

## Findings beyond Q1–Q6, ranked

### 1. Mutable record fields are depth-covariant: check-clean programs trap or hit an emitter floor

```vl
function f(p: { x: i32 | string }) { p.x = "s" }
const q = { x: 1 }
f(q)
print(q.x + 1)
```

`vl check`: rc 0. `vl run`: `wasm trap: cast failure` (probe `p2`). The same result holds:

- through a bound, `function setx<T: { x: i32 | string }>(t: T)` (`p3`: rc 0, then a trap);
- with `{ x: i32 | null }` (`p7`: rc 0, then a trap);
- with a struct-union field, `p: { sh: Circle | Sq }` given `{ sh: Circle }` and written
  `{ s: 5 }` (`p6`: rc 0, then `emitProgram: field access receiver is not a struct`, a clause-2
  floor).

The **un-annotated** `function setx(t)` is refused correctly at the pin (`p5`), so this is a
two-faces split.

This is Java's `ArrayStoreException` for records. The type-level fix is standard and matches
the list ruling: a mutable field is invariant in depth. I found no inventory row for it (I
grepped for depth, covariance and `cast failure` rows). It should be filed, and F5 should not be
built until it is fixed, because `{ readonly x }` gets its whole meaning from being the
*covariant* one of the pair.

### 2. The cost bound ignores calls: a loop-free getter costs 2³¹ calls

This is detailed under Q2, probe `p10`. It is a defect in the *built* v1 contract as well as in
the amendment. The fix is one term in the formula, plus the same term in the std baseline.

### 3. The effects doc says the checker has no effect analysis. It has one, and it already decides acceptance

§A1 says "there is no call graph in the checker", and cites concurrency §4's "no purity or
effect analysis today". `typecheck.vl` has `fnWriteEffects(fnIx, paramIx)` and
`fnWriteFreePaths(fnIx)` (around lines 4543–4900). Together they are:

- a **per-parameter, path-precise, transitive** write summary with a least-fixpoint treatment
  of recursive cycles (`weCut`), memoised in `weSums`;
- used by `callInvalidatesReal` to retire narrowings.

Probe `p8`: `if t.v != null { clr(t); print(t.v.length) }` is refused with "the call to 'clr' …
can write it". This is exactly LLVM `argmem` or GCC modref, which §B2 finding 5 calls "a later
refinement". It is **already built**, and it is an *acceptance* rule that reads callee bodies
in other files.

Consequences:

- (a) The summary's `W` must **subsume** this analysis at the same precision, or narrowing
  regresses. A single `W` bit would invalidate every narrowing across every writing call.
- (b) Two analyses answering "does this call write `o.v`?" is the "two analyses would
  disagree" risk that I1 argues against, and it exists today.
- (c) The owner's principle "acceptance must be local" should be restated against this
  precedent. VL already accepts acceptance that depends on the bodies of visible callees. The
  line it draws is at *flow* (F-B), not at *bodies*. That is a defensible line, but the doc
  should say it is the line.

### 4. The freshness rule (§C2) is unsound on nested paths

"A write whose place is rooted at a `const` local bound directly to an allocation … does not
set `W`." Consider:

```vl
function g(p: P) { const r = { inner: p }; r.inner.x = 1.0 }
```

The place is rooted at the fresh `r`, but the object written is `p`'s. The rule must ask
whether the **written object** is fresh, which is the path's prefix (`r.inner`), not its root.
The simplest sound form is: only `r.f = …` with `r` fresh, at depth 1. The same flaw exists in
the `R.heap` root classification. `const r = { t: LUT }; r.t[0]` reads a module `const`'s heap
through a fresh root, which lets it past `pure`'s ¬`R.heap[const]`, the exclusion that exists
for workers.

### 5. `hoistable` omits ¬A, so hoisting or CSE of an allocating call changes aliasing

`const e = mk()` inside a loop, where `mk` is effect-free, terminating and trap-free and returns
`{ x: 0.0 }`, yields a *fresh* object each iteration. Hoisted, every iteration shares one
object, and a later `e.x = i` becomes visible across iterations. Allocation identity is
observable wherever objects are mutable references (B14). `hoistable` and any CSE predicate
need ¬A, or a proof that the result does not escape. Haskell can CSE because nothing is
mutable; VL cannot borrow that.

### 6. Per-instance acceptance of a generic's `pure` is non-local

```vl
pure function add<T>(a: T, b: T): T { a + b }
```

This is `pure` at `i32`, and impure at a `Logged` whose user-defined `"+"` prints, declared in
another module. A call `add(l1, l2)` in a third file then turns the *declaration's* marker into
an error. That is the refusal-at-a-distance that property-access §C2 rejected F2(b) for.
Getters will meet the same problem when D2031 lets generic `new` types carry them.

There are two principled answers:

- **Parametric checking.** An operation on `T` is `X` unless `T`'s bound says otherwise.
  Koka's answer is an effect-row variable on the bound.
- **Treat purity as a constraint on `T`**, reported at the *instantiating call*. This is Nim's
  rule applied to type parameters instead of function parameters.

Either is coherent. Per-instance checking reported at the declaration is not.

### 7. (Minor) Result-type restriction and narrowing

The getter's non-boxing result rule (F9 (a)) happens to exclude nullable scalars, so narrowing
through getter paths only matters for nullable references. That is small enough to *allow*,
under the existing `callInvalidatesReal` rule plus linear-memory stores, rather than adopting
Kotlin's blanket refusal. The payoff is `if v.parent != null { v.parent.x }` on a flat-row
getter. It is optional, but it is the kind of thing Q1's error-versus-lint choice decides.

---

## What I would adopt

- **Koka's discipline for the summary's internals:** treat the "effects via parameter k" and
  "operation on T" entries as effect variables, solved at call and instantiation sites. This
  is the engine behind Nim's rule and behind Finding 6, and it never needs to appear in syntax.
- **Swift's `{ get }` / `{ get set }` split, as the typing rule** (`{ x } <: { readonly x }`,
  one way), with invariant mutable fields. This is the record twin of the list ruling VL
  already made.
- **Idris's placement of totality:** checked where declared, with the declaration as the unit
  of opt-out, not a comment at every use.
- **GCC's `looping` flag lesson**, which the doc already takes: termination is separate from
  purity.

## What I would warn VL away from

- **TypeScript's `readonly`-ignored-for-assignability** (#13347). If F5 ships while Finding 1
  stands, VL has that hole in the other direction.
- **Java's covariant mutable containers**, for records as well as arrays. Finding 1 is this
  mistake, live today.
- **A cost measure that counts syntax (back-edges) rather than work.** Finding 2 shows how that
  goes wrong.
- **Letting `pure` drift toward "cheap"**, and letting it be cited as Koka's `pure` while it
  admits reads of mutable arguments.
- **A second write analysis.** Build `W` on `fnWriteEffects` rather than beside it.
