# Type-bound UFCS resolution — a nominal type's methods and operators without importing each

> Status: design, verified against the current checker and `dist/vl`. No compiler source
> touched by this doc. Recommends landing (the method half, at least) **before** SIMD
> (`docs/internals/simd-design.md`, ROADMAP row 32) — SIMD's own §H names its operator
> question as unverified against `typecheck.vl`, and §B4 below settles it: unverified was
> optimistic, the current model cannot host SIMD's plan at all.

## A. The cost this closes, measured

VL's whole method/operator-call surface is UFCS: `o.f(a)` is sugar for a free function
`f(o, a)` whose first parameter is named `self` (`DECISIONS.md` B14). There is no `impl`
block, no trait, no namespace attached to a type — a type's "methods" are just every
`self`-function anywhere in the program graph that accepts it, and **resolving one requires
the function's own name to be imported**, exactly like any other free function
(`DECISIONS.md` "UFCS is never implicit", owner ruling 2026-09-02).

That rule is fine when a type has one or two methods. It gets expensive in direct proportion
to a type's surface, and two cases in flight make the proportion large:

- **`std:simd`'s recommended surface is ~60 functions** over 8-10 vector newtypes
  (`F32x4`/`F64x2`/`I32x4`/`U32x4`/`I16x8`/`I8x16`/`U8x16`/`I64x2`, two `Mask` types) —
  loads, stores, splats, arithmetic, compares, reductions, shuffles, converts
  (`docs/internals/simd-design.md` §D). Every kernel that touches more than one or two of
  these pays an import line per function, and the width suffix (`addF32x4`, not `add`) exists
  **only** because nothing today lets `add` be found from the receiver.
- **`std:buffer` already has 44 exports** (`std/buffer.vl`) over one un-branded struct
  (`Buf`) and four newtypes (`F32View`/`I32View`/`F32Base`/`I32Base`). It is the standing
  proof that this is not a SIMD-only problem — any sufficiently useful type accretes a wide
  method surface, and VL's flat namespace (`docs/internals/modules-design.md` §2.2, "the cost
  of deferring [namespaces] is the names, not the feature") makes every one of those names a
  near-permanent, individually-imported liability.

**This is not a new question — it was asked and declined on ergonomics grounds alone.**
`DECISIONS.md`'s 2026-09-02 ruling records: *"The compiler does NOT look into the module that
defines the receiver's type for an exported `f(self: T, …)` — a type-directed fallback was
proposed and declined as 'potentially buggy; for now we don't need it'."* The declared
mitigation was tooling (LSP completion + a quick-fix, D1230/D1570, both built). SIMD's shape
is what "we don't need it" stops being true for: §B4 below shows the *ergonomics* argument was
never the hard blocker — the **operator** side of VL's current dispatch model cannot express
SIMD's own plan (`add`/`+` per vector type, no suffix) at all, import or no import. This
design proposes the type-directed rule the 2026-09-02 ruling declined, scoped narrowly enough
to answer "potentially buggy" directly (§D, §F) rather than re-litigate the ergonomics.

## B. Verified today, against `dist/vl`

Every claim below is a program run with `dist/vl run`/`check` from this repo's `master`
(2026-09-07), not a reading of the source. Full sources are in this PR's absence — reproduce
with the one-liners shown; each is under ten lines.

**B1 — a constructor import already infers the type; no type import is needed to *use* a
value.**

```vl
import { Buffer } from "std:buffer"
const b = Buffer(16)
print(b.length)
```

Runs, prints `16`. `Buf` was never imported — `b`'s type rides `Buffer`'s return type. This is
the task's own premise and it holds exactly as stated: **the type name is needed only to
write an annotation**, never to hold or read from a value.

**B2 — a UFCS method that would dispatch is refused for the one reason that it isn't
imported, even though the compiler already knows exactly which module it lives in.**

```vl
import { Buffer } from "std:buffer"
const b = Buffer(16)
b.storeI32(0, 42)
print(b.loadI32(0))
```

`vl check` rc 1:

```
'storeI32' is not imported — a free `storeI32(self: …)` accepting Buf is exported by
"std:buffer"; a UFCS call resolves only names in scope, so import `storeI32` from there —
add `storeI32` to the existing `import { … } from "std:buffer"`
```

Importing `storeI32`/`loadI32` alongside `Buffer` makes it run and print `42`. The diagnostic
is D1230 (`ufcs-not-imported`) — the compiler's own candidate-search (`ufcsMissingImportSpecs`,
§C) already found the one right module; the design question is only whether that search
should also be allowed to *settle* the call, not merely name the missing import.

**B3 — a `new`-branded newtype (SIMD's exact shape) behaves identically.**

```vl
export type Vec2 = new { x: f64, y: f64 }
export function mkVec(x: f64, y: f64): Vec2 { return { x: x, y: y } }
export function add(self: Vec2, other: Vec2): Vec2 {
  return { x: self.x + other.x, y: self.y + other.y }
}
```
```vl
import { mkVec } from "./vec"
const v = mkVec(3.0, 4.0)
const w = mkVec(1.0, 1.0)
print(v.add(w).x)   // ctor only, no `Vec2` import
```

`v.add(w)` refuses exactly like B2 ("'add' is not imported … exported by \"./vec\""); adding
`add` to the import makes it run and print `4`. Confirms the newtype case SIMD depends on is
not a special case of anything — it is the *same* refusal as a plain struct's.

**B4 — the one surprise, and the sharpest finding in this doc: operators already resolve
type-directed, with no import at all, but through a single GLOBAL name slot that cannot hold
more than one declaration — which is exactly what SIMD's plan needs.**

```vl
export type Vec2b = new { x: f64, y: f64 }
export function mkVec2b(x: f64, y: f64): Vec2b { return { x: x, y: y } }
export function "+"(self: Vec2b, other: Vec2b): Vec2b {
  return { x: self.x - other.x, y: self.y - other.y }   // deliberately "wrong" to prove it fires
}
```
```vl
import { mkVec2b } from "./vec2"
const v = mkVec2b(3.0, 4.0)
const w = mkVec2b(1.0, 1.0)
print((v + w).x)   // no `"+"` import anywhere
```

Runs, prints `2` (3 − 1) — the custom operator fires with **zero import of `"+"`**, for both a
newtype and a plain struct receiver (verified both ways). This is because operator dispatch
(`opSelfFnTy`, `compiler/typecheck.vl:21045`) resolves through `mergedDeclKeyOf`
(`typecheck.vl:18693`), which scans **every** declaration in the merged program by demangled
name and returns the first live one — no per-caller scope check at all. Operators were never
subject to the 2026-09-02 "never implicit" ruling; they already violate it, silently.

But the mechanism assumes **at most one declaration of a given operator symbol exists in the
whole program** — literally, `opSelfParamTy`'s own comment: *"A non-bracket operator may be
declared once per program... so the answer is unambiguous."* Two probes confirm this is a hard
wall, not a soft one:

- *Within one module*, declaring `"+"` for two different receiver types is a **declaration-time**
  error: `redeclared +`, `vl check` rc 1, before dispatch is ever considered.
- *Across two modules*, each declaring its own `"+"` for its own type, with **neither imported**:
  the program compiles, but only one type's `+` works — the other's every use fails with
  `operator '+' is not defined for T and T`, because `mergedDeclKeyOf` picked the other
  module's declaration first and stopped looking.

`std` today has zero binary-operator declarations (`grep -rn 'function "+"' std/` is empty;
only the bracket operators `"[]"`/`"[]="` exist, twice each, over `F32View`/`I32View` in
`std:buffer` — B14's already-carved exception). **SIMD is the first thing that would ask for
more than one type's `"+"` to exist in one program, and today's model cannot grant it at all** —
not an ergonomics gap, a hard collision. `docs/internals/simd-design.md` §H flags this
exact question as *"unverified against `typecheck.vl`'s resolution... a question for the
implementer"*; this is that verification, and the answer is worse than "unverified" implied.
See §G.

**B5 — the flat-namespace tax UFCS methods pay, that type-bound resolution sidesteps.**

```vl
import { mkA, describe } from "./a"   // a.describe(self: A)
import { mkB, describe } from "./b"   // b.describe(self: B)
```

`vl check` rc 1: `Duplicate binding "describe": module … imports it from both "./a" and
"./b" — rename one`. Two modules exporting a same-named method for two *different* receiver
types cannot both be explicitly imported under their own name — B16 (one binding per name per
scope) fires on the plain import text itself, before any call is even written, regardless of
whether the two would ever actually collide at a call site. This is the exact cost
`modules-design.md` §2.2 names as std's forcing constraint ("`std:path` wants both `join` and
`split`, which `std:fmt` already owns"). §D shows why a type-bound candidate source has no
version of this problem.

**B6 — the soundness boundary: a structurally-identical *anonymous* type does not borrow a
declared type's name, so it cannot borrow its method surface either.**

```vl
function mkAnon(): { base: i32, length: i32 } { return { base: 5, length: 10 } }
const a = mkAnon()
const bad: string = a   // force the checker to print a's type
```

Diagnostic reads `cannot assign {base: i32, length: i32} to 'bad' of type string` — **not**
`Buf`, despite `mkAnon`'s return type being field-for-field identical to `std:buffer`'s `Buf`.
The checker's own type-naming ladder (`tyToStrGo`, `typecheck.vl:10422` — `nomNameOfTy` →
`structNameOfTy` → `genAppNameOfTy` → `unionAliasDeclNameOfTy`) answers "does this arena index
carry a declared name" by table lookup on the *specific arena index*, never by comparing
field shapes. An incidental structural twin of `Buf` is not, and cannot become, `Buf`. This is
the property that makes §E's nominal-only boundary sound rather than merely convenient.

## C. The rule

**For a call `recv.m(args)` (member or operator), if ordinary resolution finds nothing, and
`recv`'s inferred type carries a declared name `N` via the ladder B6 identifies, ask `N`'s
declaring module `M` for a matching `self`-function or operator before refusing.**

**Resolution key.** Not "was `N` imported" — the *type's declaring module*, recovered the same
way `tyToStrGo` already recovers `N` for a diagnostic: `nomNameOfTy(ix)` for a `new`-branded
newtype, else `structNameOfTy(ix)` / `genAppNameOfTy(ix)` / `unionAliasDeclNameOfTy(ix)` for a
declared-but-structural type (`Buf`'s case), each already a lookup against the specific arena
index, never a shape comparison (§B6). "Nominal" in the task's sense is therefore this design's
"carries a declared name" — broader than `DECISIONS.md`'s stricter internal usage where
*nominal* means specifically newtype-branded (`nomNameOfTy`'s own doc comment: "the brand
arena index carries... an ordinary structural type" is its complement). This doc uses **named**
for the general case and **branded**/**newtype** for the strict one, to keep the two apart.

**Where the module is recovered from.** The name the ladder returns is, once merged, already
mangled with a `$m<N>` suffix (`modBuildRename`/`modRenamed`, `compiler/driver.vl:3904/4125`) —
the *same* integer `m` that `expMod`/`expName` (`driver.vl:423-424`, the exported-declaration
registry any `export` populates) and `ufcsScopeMod` (`compiler/ast.vl:1355`, D1191's per-module
UFCS scope table) already key on. **No new arena field is required** — the module is already
latent in every named type's own mangled spelling, and a program with no merge (single file)
has no suffix at all, which is the correct answer too (there is only one module, and nothing
about it needs a name). The one piece of new code is a small decoder for that suffix
(or, if the owner prefers not to depend on string-parsing a mangling convention, a parallel
`nwModIx`/`structModIx` array banked alongside `nwTyIxs.push`/`cStructNames.push`
(`typecheck.vl:12529`/`26277`/`26301`) at the same declaration site — more principled, slightly
more surface; §K asks which).

**Where it hooks.** Two call sites, symmetric with how B2/B4 already work:

- **Methods** — `ufcsCallTy` (`typecheck.vl:22264`) resolves the callee via
  `ufcsAliasAtSite`/`ufcsAliasInScope` (`ast.vl:1420/1431`), which asks the *calling* module's
  own scope (`ufcsScopeIn`, `ast.vl:1388`) and returns `-1` on a miss. The new rung: on that
  miss, ask `ufcsScopeIn(homeModuleOf(recvTy), plainName)` — the receiver type's *own*
  declaring module's scope, using the exact same table D1191 built, just queried from the
  other side. If that resolves, dispatch precisely as `ufcsCallTy` already does (arity,
  `assignable(recvTy, params[0])`, defaults) — nothing about *how* a call binds changes, only
  *which module is asked* when the caller's own scope has nothing.
- **Operators** — `opSelfFnTy` (`typecheck.vl:21045`) needs the equivalent rung, but first
  needs the declaration-time collision (§B4) lifted; see §G, which is the larger of the two
  changes this design implies.

**Non-goal, explicitly.** This does not change what it takes to *write an annotation*
(`const v: Vec2 = …` still needs `Vec2` imported) or to *construct* a value from nothing —
only what it takes to *call* a method or operator on a value already in hand. §K.5.

## D. Coherence — the orphan rule

**Only `N`'s own declaring module may contribute a type-bound candidate for `N`.** A third
module `M2` that also happens to declare `function paint(self: N)` (having imported `N` to
write the annotation) is never consulted by this rule — calling `.paint()` on an `N` still
needs `paint` explicitly imported from `M2`, exactly as today. This is deliberate and is what
makes the rule unambiguous by construction: for a *concrete* named type, there is exactly one
declaring module, so there is exactly one place to look, so two modules can never both offer a
type-bound answer for the same `(N, name)` pair. `F32x4.add` is unambiguous because there is
exactly one `std:simd`, not because of a tie-break rule that resolves a conflict — there is
never a conflict to resolve.

**Re-exports chase to the original declaration, not the re-exporting module** — the same rule
`modMergedTargetOf` (`driver.vl:3400`) already applies for a re-exported *name*: "when `m`
re-exports rather than declares it, follows the chain to the declaring module." A convenience
re-export of `F32x4` from some aggregator module does not make the aggregator a second home;
`F32x4`'s methods still live where `F32x4` itself is declared.

This is a deliberately narrower answer than "extension methods anywhere" (Rust's coherence
orphan rule, C#'s `this` extension methods) — it grants the privilege *only* to the module that
already owns the type, never to a third party. `docs/guide/collections-design.md` §C2.8 flags
almost this exact question for `List`/`Map`/`Set` ("two self-functions named `f` on different
`self` types is itself something the binding model has to permit... flag, don't decide here")
and leaves it open; this design is a proposed settlement of it, scoped to the
already-declaring-module case.

## E. Nominal-only boundary

A structural type written inline (`{x: i32}`) has no declared name at all — `nomNameOfTy` and
`structNameOfTy` both answer `""` for it (§B6) — so it has no home module, so this rule adds
nothing for it: it keeps exactly today's explicit-import behavior. This is not a special case
carved out for structural types; it falls out of §C's resolution key directly (no name ⇒
nothing to look up), and §B6 is the proof that a structural type cannot *acquire* a name by
happening to share a shape with a declared one. The boundary is therefore: **opt in by being
named**, not by any other marker — a plain `export type Buf = {…}` (§I) qualifies exactly as
much as a `new`-branded one (§B3) does.

## F. Non-breaking — the precedence rule (the load-bearing point)

**Ordinary lexical resolution (locals, parameters, imports — everything `ufcsCallTy`/
`opSelfFnTy` already consult) is tried first and wins unconditionally. The type-bound module
is consulted only as a fallback, after that search finds nothing.** Not "explicit import wins
a tie" — there is never a tie to break, because the fallback rung does not run at all when the
ordinary one succeeds.

**Why this is the only rule that cannot change an existing program's meaning.** A program that
compiles today has, by definition, an ordinary-resolution answer for every call it makes — that
*is* what "compiles" means under the current rule. Under this design, that same lookup runs
first, finds the same answer it always did, and returns — the fallback rung is provably dead
code on that call, because it only executes when the first lookup's result is "nothing." A
call whose meaning could change is a call whose meaning **does not exist today** (the program
does not compile). So the rule can only ever take a `check reject` to a `resolves`; it has no
path to take a `resolves` to a *different* `resolves`. This is the same shape as
`DECISIONS.md`'s repeated "refuse on `runs → not-runs`, not on adding capability" principle
applied one level up, at resolution rather than execution.

**What this implies for the one edge case worth naming: two *different* modules both
contributing type-bound candidates for one call.** Under §D's orphan rule this cannot happen
for a concrete named type — there is exactly one declaring module. It can only arise if
`recvTy` is a **union** of named types from different modules exposing the same method name
with incompatible signatures, which is already a narrower question than method resolution (a
union member needs `is`-narrowing before most operations reach a single member's shape at
all — `checkMemberNode`'s `sharedUnionFieldTy` gate). §K.1 recommends refusing that case loudly
rather than guessing.

**The proof obligation for the implementation.** `scripts/silent-sweep/distilled/regress.py`
showing 0 classes moved and 0 `runs → not-runs`/`→ silent` is necessary but is a lower bound
(CLAUDE.md's own standing caveat on that instrument) — it would not by itself catch a change
that made an *already-resolving* call silently rebind to a *different* function that happens to
produce the same observable output on the corpus's own inputs. The sharper check: for every
corpus/suite program with an explicit UFCS import today, assert the emitted call target
(`ufcsSiteTo[callIx]`, already banked per call site, `ast.vl:1350`) is byte-identical before and
after — not just that the program still runs and prints the same thing. That is a cheap,
targeted A/B (the site table already exists; it is a diffing script, not a new instrument) and
it is the one that actually states "no existing call rebinds," rather than "no existing program
changed its printed output," which is a weaker claim.

## G. Operators — the SIMD case, and the model change this design requires

§B4 is the crux: **SIMD's own naming plan (`add`, not `addF32x4`; `+` dispatched by receiver)
is not expressible under today's operator model at all**, independent of imports. Landing only
the method-resolution half of this design (§C-F) does not unblock it — `opSelfFnTy`'s
declaration-time collision (`redeclared +`) fires before dispatch is ever reached.

**The change:** extend `DECISIONS.md` B14's already-carved exception — "index operators are
FREE functions dispatched by receiver type, and are the one place ad-hoc overloading is
allowed" — from `"[]"`/`"[]="` to operators generally, gated by exactly this design's orphan
rule rather than B14's "no name to overload" argument (which was specific to brackets naming
nothing). The generalized invariant: **an operator symbol may be declared once *per receiver
type*, and only in that type's own declaring module.** This is strictly *more* checkable than
today's "once per program," not less — today's collision check asks a global flat-name
question with no receiver in it at all; the proposed one asks a (symbol, type) pair, and B4's
`redeclared +` fixture already shows the checker has the receiver type in hand at the
declaration site (it printed `Vec3`'s signature in the error) — the check narrows to compare
receiver types before refusing, rather than refusing on symbol identity alone.

**Dispatch** then mirrors §C exactly: `opSelfFnTy` asks `lt`'s (the left operand's type) own
declaring module for the operator symbol, via the same `ufcsScopeIn`-shaped lookup, instead of
`mergedDeclKeyOf`'s flat whole-program scan. `F32x4 + F32x4` resolves `"+"` in `std:simd`
(where `F32x4` lives); `I32x4 + I32x4` resolves a *different* declaration of `"+"`, in the same
module, keyed on the different receiver — which is exactly what §B4's probes prove is
impossible today.

**Before / after, SIMD's own numbers:**

| | today (no type-bound resolution, current operator model) | with this design |
|---|---|---|
| bring in `F32x4` arithmetic | `import { splatF32, loadF32x4, storeF32x4, addF32x4, mulF32x4, minF32x4, maxF32x4, absF32x4, sqrtF32x4, negF32x4, ltF32x4, eqF32x4, selectF32x4, reduceAddF32x4, laneF32x4, withLaneF32x4, dotI16x8, … } from "std:simd"` (~60 names across the shapes in simd-design.md §D, one width-suffixed per shape) | `import { splatF32, loadF32x4 } from "std:simd"` |
| write a kernel | `addF32x4(mulF32x4(a, b), c)` | `a * b + c` (operators) or `a.mul(b).add(c)` (methods) — `add`/`mul`/`dot`/`lane` unsuffixed, dispatched by the value's own type |
| adding `I32x4`/`U8x16` support to the same file | every new shape's ops need their own suffixed import line | no new imports — the values already carry their type, the type carries its module |
| **and, today, the second row is not just tedious — `+` for more than one vector type cannot coexist in the program at all** (§B4) | — | — |

**This is also the direct answer to `simd-design.md` §H's open question** ("Whether operator
overloading (O4) is cheap in the checker... unverified... a question for the implementer"):
it is not cheap as a bolt-on to today's model (a global collision check has to be narrowed to a
receiver-keyed one, which touches the declaration-time reject as well as dispatch), but it is
exactly the same shape of change §C already makes for methods, reusing the same orphan rule —
one coherent design decision serving both, rather than two independent ones.

## H. Interaction with namespace imports

`modules-design.md` §2.2 keeps a **deferred, revisited** proposal for `import * as fs from
"std:fs"` — "a compile-time path prefix, never a value... B16's one-binding-per-name-per-scope
is what makes it unambiguous" (no local binding can share a namespace prefix's name, so the
resolver never needs to choose between them). That is the **free-function** answer to the flat
namespace: `fs.readTextFile(p)` where `fs` is a *namespace*, not a value.

Type-bound UFCS is the **method-call** answer to the same underlying cost, and the two are
syntactically disjoint at the `.`: a namespace prefix is a compile-time-erased path segment
bound by `import * as`, never a runtime value, so `recv.m(...)` is namespace resolution only
when `recv` itself resolves as a bound namespace identifier; otherwise it is a value, and
ordinary-then-type-bound member resolution (§C) applies as today. B16 guarantees these two
readings can never both apply to the same identifier in the same scope, exactly as
`modules-design.md` already argues for locals vs. namespaces generally. Concretely: `fs.stat`
(namespace) and `myFile.stat` (a value's UFCS call, method-resolved, possibly type-bound) are
different questions the resolver already has to tell apart before this design exists, and nothing
here adds a new case to that split.

**They compose, they don't compete.** A namespace import is for reaching a module's *free*
functions under a prefix without naming each one; type-bound UFCS is for reaching a *value's*
whole method surface once you already hold one instance of its type. `std:simd`'s constructors
(`splatF32`, `f32x4`, `loadF32x4`) are still free functions someone has to name — a namespace
import would shorten *that* list (`v128.splatF32(...)`) the same way it would for any module;
type-bound UFCS is what shortens everything called *on* the value the constructor hands back.
Landing this design does not foreclose namespace imports, and does not need them landed first.

## I. Generalizes: `std:buffer` before / after

Buffer needs **only the method half** of this design (§C-F) — it declares no operators, so
none of §G's model change is required to benefit it, which is itself evidence the two halves
decompose cleanly.

```vl
// today
import { Buffer, loadI32, storeI32, store8, storeBytes, loadBytes, fill } from "std:buffer"
const b = Buffer(64)
storeI32(b, 0, 42)
store8(b, 4, 0xFF)
print(loadI32(b, 0))

// with this design
import { Buffer } from "std:buffer"
const b = Buffer(64)
b.storeI32(0, 42)
b.store8(4, 0xFF)
print(b.loadI32(0))
```

Both compile to identical wasm (§C changes only *resolution*, never lowering — `ufcsCallTy`'s
own binding logic is untouched, only what feeds it a candidate). The second form needs one
import instead of `Buf`'s live set of up to 44; a program using ten of `Buf`'s methods pays one
import line, not ten. `F32View`/`I32View` (`Buffer`'s own newtypes, `std/buffer.vl:233/236`)
already exercise `[]`/`[]=` overloading (B14's existing exception) and would gain the rest of
their surface (`getF32`/`setF32`/`byteAddrF32`/`f32base`) the same way, with zero operator
involvement — a second concrete non-SIMD proof of §C in the same file SIMD itself imports from.

## J. Discoverability — "did you mean" for a method that isn't there

Today, a typo on an *imported* name gets nothing:

```vl
import { Buffer, loadI32 } from "std:buffer"
const b = Buffer(16)
print(b.loadi32(0))   // typo: lowercase i
```
```
no field 'loadi32' on Buf
```

No suggestion, even though `loadI32` is sitting right there in scope. Under this design, `Buf`
gains a well-defined, enumerable surface — every `self: Buf`/operator declared in `std:buffer`
— which is exactly the input a nearest-name suggestion needs and does not have today. Recommend
a third coded diagnostic alongside D1230 (`ufcs-not-imported`) and D1570
(`ufcs-not-method`) — say `ufcs-no-such-member` — raised from the same home
(`memberFloorErr`, `typecheck.vl:18557`) when neither of those two fires and the receiver *does*
have a declaring module: compute the nearest name (Levenshtein, small fixed edit-distance
cutoff) over that module's own self-fn/operator names, carry it on `data` exactly as D1230/D1570
already do (`tErrCodedData`), and let the LSP's existing quick-fix machinery offer a rename.
This is pure discoverability riding on data the design already needs to compute (a module's
type-bound name set) for §C's own resolution — not new infrastructure, an new consumer of it.

## K. Open questions for the owner, each with a recommendation

1. **Ambiguous union receivers** (§F) — a call on a value typed as a union of named types from
   *different* declaring modules, both offering the same method name. *Recommend*: refuse
   loudly, naming both candidate modules (reusing D1230's multi-candidate message shape), and
   require an explicit import to disambiguate. This is rare (narrowing already gates most
   member access on a union) and "refuse rather than guess" matches every other ambiguity rule
   in the tree.
2. **Extend operators beyond `"[]"`/`"[]="` (§G)** — required for SIMD's naming plan; not
   required for Buffer. *Recommend*: yes, gated by the orphan rule (once per receiver type, in
   that type's own module) — it is the same design decision as §C, not a second one, and SIMD
   cannot ship its recommended surface without it (§B4).
3. **Re-export chasing (§D)** — does a type-bound candidate search follow a re-export to the
   original declaring module, or stop at the re-exporting one? *Recommend*: the original,
   mirroring `modMergedTargetOf`'s existing precedent for names generally.
4. **Generic named types** (`Pair<i32, i64>`, via `genAppNameOfTy`) — does a generic
   instantiation's declaring module still apply? *Recommend*: yes, uniformly — a generic
   type's declaring module does not depend on its type arguments, so no special case is needed;
   flagging only because it was not explicitly probed here (no generic newtype exists in
   `std` today to test against).
5. **Does this widen what can be *written*, not just what can be *called*?** *Recommend*: no —
   an annotation still needs the type's own name imported (unchanged from today, per the
   task's own premise, §A/§B1). This design is about a value already in hand, not about
   shrinking the type-import surface; keep those two questions separate; conflating them is
   the fastest way back to "potentially buggy."
6. **Discoverability (§J) timing** — build alongside, or as a follow-up? *Recommend*:
   follow-up. It is pure ergonomics riding on data §C already computes, not a correctness
   dependency, and should not gate the resolution rule's own review.
7. **How the module index is recovered (§C)** — decode the mangled name's `$m<N>` suffix
   (zero new arena fields, depends on a naming *convention* staying stable) vs. bank a direct
   `nwModIx`/`structModIx` parallel array at declaration time (one new field per sidecar, no
   dependency on string layout). *Recommend*: start with the decode — it is strictly less
   code and the convention is already depended on by `modRenamed`/`expMod`/`ufcsScopeMod`
   elsewhere — and revisit only if an implementer finds the string-parsing genuinely awkward
   at the call site.

## L. Sequencing

**Recommend landing the method half (§C-F) first, as its own PR, validated primarily against
`std:buffer` (§I) since it needs no operator-model change and already has 44 exports to prove
the ergonomics on.** It is a strict resolution-only addition (§F) with a concrete, cheap A/B
(the `ufcsSiteTo` diff, §F) and no interaction with SIMD's still-open rulings.

**Land the operator extension (§G) second**, as a smaller, separately-reviewable PR — it is
gated on an owner decision (§K.2) the method half is not, and it is the piece
`docs/internals/simd-design.md`'s S3 slice ("`F32x4` load/store/arith/compare... the whole
rigid-body solver's need") directly depends on: S3 is the first slice that gives veldt
something real, and its arithmetic/compare ops are exactly the operators §G unblocks. SIMD's
own §G sequencing (S0-S3) is otherwise unaffected — this design touches only how a call
*resolves*, never the `v128` rep, the intrinsic family, or the `0xFD` opcode writer.

Both halves are pure resolution changes: no new wasm bytes, no rep changes, no emitter
changes. The implementation's own proof obligation is §F's — 0 `runs → not-runs` on the
distilled corpus, plus the `ufcsSiteTo` byte-for-byte A/B on every existing explicit-import
call site, before either half merges.
