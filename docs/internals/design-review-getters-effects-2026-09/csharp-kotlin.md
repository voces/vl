# Persona review: getters and function effects, from C# and Kotlin

## Who is reviewing

I have written C# since `get_X()`/`set_X()` showed up in IL and Kotlin since 1.0. I have
shipped libraries where turning a field into a property was a binary break, chased CS1612 through
`List<Point>`, watched `DateTime.Now` and EF lazy-loading navigation properties do I/O behind a
`.`, and used Kotlin extension properties (`val Int.dp`) and `by lazy` everywhere. What I value:
the **uniform-access promise** (a caller can't tell storage from computation), **abstraction
over properties** (an interface can declare `X { get; }`), and an evolution story that lets a
library change a member's implementation without breaking callers. I judge VL against those.

Probes are in `persona-review/csharp-kotlin/` (`p1`–`p9`), run with `dist/vl` on this branch's
build. Every outcome quoted below is copied from what the program printed.

---

## Q1. Should the body contract be a hard error? **Modify: keep it an error, and loosen what a getter may CALL, not what it may COST.**

The C# precedent argues against demoting it, not for it. The Framework Design Guidelines have
said "use a method if the operation is orders of magnitude slower than a field, has side effects,
or returns a different value on each call" for twenty years. It is still the most-violated rule
in .NET:

- `DateTime.Now` returns a different value on every call.
- `Process.HasExited` makes a syscall.
- EF navigation properties run a SQL query on first touch.
- WinForms `Control.Handle` creates a window.

The analyzers (CA1024, CA1065 "no exceptions in getters", CA1819 "properties should not return
arrays") are warnings, and every large codebase suppresses them. Kotlin's convention ("cheap, or
cached on first call") fares no better. A guideline has never kept `.` cheap in either ecosystem.

The key argument is about **who reads the code**. A lint protects the *author*. The contract's
value is to the *reader* of `v.x`, who can't see whether `v`'s type came from std or from a
coworker's module. With a warning plus `// vl-allow getter-cost`, the reader's guarantee
becomes "cheap unless someone suppressed it". That is exactly C#'s guarantee, and C#'s is
worthless. Two more costs of the proposal:

- Per-site suppression would be a new mechanism that VL doesn't have today. Its first use would
  be to switch off a language guarantee.
- **The escape hatch already exists and costs two characters: `()`.** A getter that must loop
  over data is a method. That is the FDG rule made mandatory, and making it mandatory is the
  one thing .NET could never do after 1.0.

The contract does chafe, but in a different place: **v1 lets a getter call only intrinsics and
other getters**. p2 is the everyday C# expression-bodied property that calls a helper:

```vl
function chan(v: i32, s: i32): i32 { return (v >> s) & 255 }
get r(self: Color): i32 { chan(self as! i32, 16) }
// the getter `r` on Color calls `chan`, which is neither a pure intrinsic nor a getter
```

So **"extract function" breaks a getter**. That refactoring is the most common one in any IDE,
and here it turns a compiling getter into a refusal even though `chan` is getter-eligible by
every rule in the contract. That restriction, not the cost rule, is what will generate the
complaints that push toward a warning. Prioritise the effects summary's "may call any
getter-eligible function" (effects §C1b, stage S2) over any change to the severity. p9 is the
same shape: `self.text == ""` is refused because string `==` loops. It is correct under the
invariant, but a C# user will hit it on their first `IsEmpty`. The message should suggest
`self.text.length == 0`, which is allowed.

## Q2. Constant-bounded loops, budget 64, transitive: **Agree with the loops. Disagree that the invariant is a sufficient stopping rule: it bounds iterations, not work.**

The "never data-dependent" invariant is a good stopping rule for *loops*. `for i in 0 until 4`
passes and `for x in xs` never will, and that line is easy to teach. But the budget counts loop
iterations, and **straight-line calls count 0**. A DAG of getters that each read the previous
one twice has `Bounded(0)` at every level and does 2ⁿ work. p8 is 26 loop-free getters:

```vl
get g0(self: C): i32 { self.a }
get g1(self: C): i32 { self.g0 + self.g0 }
…
get g25(self: C): i32 { self.g24 + self.g24 }
```

`vl check` accepts it (as does `g40`, p8c, `Checked 1 file, no errors`). At the default build,
**1,000 reads of `c.g25` took 58.9 s of CPU**, and a single read of `c.g40` was still running
when `timeout 120` killed it. (At `-O3` binaryen folded the constant-receiver version to
nothing, so this is the default build's cost. I didn't measure a data-dependent receiver at
`-O3`.) It's contrived, but a reviewer's job is to find where the invariant has a hole, and the
hole is that **"bounded" is not "cheap"**. Two fixes:

1. **Count call sites as well as iterations.** Make `bound(f)` the §C1a sum plus 1 per call (or
   per getter read), multiplied by the enclosing trips. Then the budget bounds the number of
   calls executed, which is what the owner's test ("would I feel bad calling this in a loop")
   is about. The existing g-chains in std (`twice` reads `len2`) cost 1–2 and fit easily.
2. At minimum, refuse a getter whose transitive call **multiplicity** exceeds the budget.

The transitive budget also has a Kotlin-`inline`/C#-`const` smell: a user's getter can stop
compiling because a std body got more expensive. The std baseline (effects §E4) covers std.
Inside a user program it's loud and local, so it's acceptable. That is the same trade whole-
program compilation already makes everywhere else.

## Q3. Setters: **Agree with "none", and don't narrow it yet.** The reason isn't CS1612, though.

CS1612 exists only because C# has mutable value types that a property returns by copy. VL's
scalar newtypes are that case (`c.r = 5` on `Color = new i32` would need write-back into `c`,
which is Swift's `mutating`/`modify`), so "none on value types" is forced. For reference-backed
nominal types a setter would work mechanically: p7 shows that `h.p.x = 9.0` through a getter
`p` returning a struct reference writes through and prints `9`. That behaviour is right for
reference semantics.

What makes a setter worth having in C# and Kotlin is validation or notification over a
**private backing field** (`set { if (value < 0) throw …; field = value; OnPropertyChanged(); }`).
VL has no private fields, so a validating setter guards a door beside an open window: anyone
can write the stored field directly. And what users actually wanted when C# added `init` (C# 9)
and Kotlin has `private set` is **immutability after construction**. That is `readonly` fields
(A9 / F6), not setters. Build readonly fields and field privacy first. Revisit setters only if
a reference type then needs a validating write that `readonly` plus a method can't express.
Narrowing the ruling now buys nothing.

## Q4. Getters in read-only structural contracts: **Agree with F5, and it is more urgent than "build later" suggests: today NO bound admits a getter at all.**

In both of my languages the answer is settled. A C# `interface IPoint { float X { get; } }` is
implemented by a get-only or a get/set property. A Kotlin interface `val x: Float` is
implemented by a `val` or a `var` with any backing. A read-only requirement satisfied by stored
and computed members alike is the mainstream design. `{ readonly x: f32 }` is the right
spelling, and refusing plain `{ x: f32 }` (write-permitting) is right: TypeScript #13347 is the
cautionary tale.

But p1 shows the design's stated workaround doesn't work:

```vl
get r(self: Color): i32 { … }
function red<T: { r(): i32 }>(t: T): i32 { return t.r() }
function red2(t) { return t.r }
// red2(c): argument 1: expected {r: _}, got Color
// red(c):  Color does not satisfy `{r():i32}`: no `r(): i32` — the bound needs a field of
//          that type or a `r(self: Color, …)` function in scope at this call
```

`docs/guide/getters.md` says generic code "asks for the method `{ x(): f32 }` instead". That is
false. A getter refuses `v.x()`, so it can't satisfy a method bound either. **Even the
un-annotated `function red2(t) { return t.r }` is refused.** In a language whose pitch is
"types hidden by aggressive inference", a getter-bearing type therefore can't be passed to any
generic or un-annotated helper that reads the property. In C# terms, you have declared a
property that no interface can ever abstract over. (The refusal message also repeats the
misleading "or a `r(self: Color, …)` function in scope" fix that property-access §G3 filed.)

Recommendations:

- Fix the guide sentence now.
- Build `{ readonly x: T }` at **specialised positions only** (generic and un-annotated), where
  monomorphisation makes it free.
- At non-specialised positions (heterogeneous lists, struct fields, function-typed params), keep
  the existing loud refusal. Don't build witness tables: that is C#'s interface dispatch, and
  VL's performance consumers chose VL to avoid it.
- In a generic body over `{ readonly x }`, reads must **never narrow**, whatever the instance
  (the Kotlin smart-cast rule). Otherwise narrowing depends on the pin, which is the
  position-split this repo spends its life fixing.
- Name the semantics carefully. `IReadOnlyList<T>` taught .NET that "readonly" gets read as
  "immutable", and it only means "you can't write through this view". Say so in the guide.

## Q5. Getter-eligible is not `pure`: **Agree.**

C# 8 `readonly` struct members are the nearest precedent. A `readonly` getter may read every
field of `this`; it may not write them. Nobody calls that "pure", and `[Pure]` in
`System.Diagnostics.Contracts` meant something else. It was unchecked, and it died with Code
Contracts, which is itself evidence for the doc's "no unchecked marker" rule. A getter
describes its receiver; `pure` describes a function's relation to the world. Keep them apart.
One request: users will see "getter-eligible" in diagnostics and hover, so name it in words
users recognise (the messages say "a getter body is loop-free, …"; keep that and don't surface
the term `getter-eligible`).

## Q6. The effects summary: **Agree with the shape; three modifications.**

Inferred and never in a type is the right call. C# never got an effect system, and the one
it half-had (`[Pure]`, checked exceptions it refused to copy from Java) shows that annotation
burden kills adoption. Nim's call-site charging (F-A+) is `rethrows` without the syntax. Good.

1. **The two docs contradict each other about rep-boxing, and the "relax-only" rule decides
   which one wins.** Getters v1 refuses by type (p3: `i32 | null` result "whose representation
   is boxed (it allocates)"). The effects doc (§C3, §H) rules that rep boxes are a **hint, never
   an error**, and that acceptance must not depend on representation. When S2 replaces the v1
   walk with the summary, the "only relaxes" rule means `get owner(self): i32 | null` becomes
   legal and allocates on every read. Decide now which is intended. From Kotlin, where
   `val first: Int?` is everyday code, I'd keep the type rule for std exports only.
2. **Add a call-count term to `B`** (see Q2). As written, `B` is "iterations", and effects §C1b
   derives the cost tiers from `A` and `B` alone, so tier 2 includes p8.
3. **Hover must show the chain to the *first* reason**, as §D proposes, plus the std baseline
   diff in the PR that changes it. A transitive rule that breaks a user getter needs "because
   `normalize` now loops at simd.vl:40", or it reads like C#'s `const` inlining across
   assemblies: correct, and baffling.

Nothing looks excessive. `U` reserved and `T` optimizer-only are cheap. I'd drop `S` (suspends)
until concurrency needs it, because a reserved bit tends to get read as if it were live.

---

## Findings beyond Q1–Q6, ranked

**1. A getter-bearing type can't be abstracted over at all, and the guide says it can** (p1,
above). A newtype with getters is refused by `{r(): i32}`, by `{r: i32}` and by an
un-annotated `t.r`. This is the one finding I'd fix before any more std getters ship. Fix the
docs today, and move F5 up.

**2. Field → getter evolution is a breaking change in VL too, so property-access §E2's "uniform
access for std" argument is overstated.** In C# it is source-compatible but binary-breaking. In
VL, binaries don't matter (whole program), but *source* breaks:

```vl
type V = new { len: i32 }                  // p5: useLen<T: {len: i32}>(v) prints 3
type V = new { n: i32 }; get len(self: V)  // p6: V does not satisfy `{len:i32}`: no `len`
```

Construction breaks too (`{ len: 3 }` no longer builds a `V`). So "a declared getter gives std
one way to evolve" is true only for *readers that are not generic*. `std:buffer`'s views can't
move `length` behind a getter without breaking every `<T: {length: i32}>` caller. Only F5
(`{readonly x}` satisfied by both) makes the C#/Swift field-to-computed story real.

**3. The iteration budget doesn't bound work** (p8: 58.9 s for 1,000 reads of a loop-free
getter, and `g40` didn't finish in 120 s). This is a hole in the invariant the owner is relying
on, not a performance nit. Fix: charge calls in `B`.

**4. `?.` doesn't read getters** (p4: "`?.` reads only a declared struct field — narrow the
receiver instead"). For a Kotlin or C# developer, `user?.name` on a property is *the* use of
`?.`, and in both languages it has worked on properties from the first day `?.` existed. Refusing
it is consistent with `?.length` today, but that is two refusals of the most-reached-for idiom
rather than one. Lowering `v?.x` to `v == null ? null : x(v)` is local, and it's a checker rung
rather than a design question. Put it on the list, and note that the result is then a nullable
*scalar*, which the type rule refuses as a getter result but which is fine at the use site.

**5. No extension getters (the orphan rule), while extension *methods* are free.** A user can
write `function xy(self: F32x4): F32x2` anywhere and call `v.xy()`, but can't write `get xy`.
Kotlin's extension properties (`val String.lastChar`, `val Int.dp`) are among its most-used
features, and C# 14 finally added them after 18 years of demand. The orphan rule is defensible
(D1984 immunity, one home module). But it makes the parenless form a **privilege of the type's
author**. Users will notice that `.x` is std-only for std types and ask for `.xy`. Write the
reason into the guide now ("a getter's name is part of the type's API, owned by its module"),
so the ruling reads as a choice rather than a gap.

**6. Generic nominal types can't have getters** (D2031, `Box<T>`). `Box<T>.Value` and
`Optional<T>.value` are the canonical properties in both of my languages. This one is a known
gap, so the only ask is to make sure the refusal says "not yet" (D2031) and not "never".

**7. Learnability: the getter/method split is a declaration-site choice that callers must
remember.** `v.x()` on a getter and `v.x` on a method are both refused. The messages are good
(the getter one says to drop the `()`). This is Scala 3's rule and the right one. C#'s IDE makes
it painless through completion glyphs, so make sure LSP completion inserts `x` for a getter and
`x()` for a method, not just shows a kind.

---

## Adopt, and avoid

**Adopt from C# and Kotlin:**

- Read-only interface properties satisfied by storage or computation (F5).
- `readonly` fields and `init`-style construct-then-freeze (A9) *before* setters.
- Kotlin's smart-cast refusal through custom getters. VL already did this; keep it for F5
  generics.
- A code fix in the LSP for every getter refusal: "convert to method" (`get x` → `function x`,
  and rewrite the callers' `.x` to `.x()`). That is the Roslyn move that makes a strict rule
  cheap to obey.

**Avoid:**

- **Demoting the contract to a warning.** .NET is the twenty-year experiment in guideline-only
  getters, and `.` stopped meaning cheap there.
- **Adaptors or witness tables for structural getters.** That rebuilds interface dispatch.
- **Letting a representation choice decide acceptance** (see Q6.1).
- **Adding property syntax to `length`-style built-ins without the same contract.** B6 and the
  getter contract should be one rule.
- **Anything like Kotlin's `by lazy` or delegated properties.** A cached property is a hidden
  write plus an allocation, so it fails both halves of the contract. It is a method with a
  memo.
