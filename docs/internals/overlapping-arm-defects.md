# Overlapping-arm union defects — the sweep, and the two general root causes

**Origin.** #1340 closed a silent miscompile where `x is K` over a `K | string` box answered TRUE for
every string. It had been filed for months as a saturated TAG-BAND problem. It was not: the real
cause is that the two arms **OVERLAP** — `K ⊆ string`, so `"aa"` is simultaneously a `K` and a
`string`, and both `x is K` and `x is string` must answer TRUE, which ONE tag field cannot do.

That argument is general, so this sweep asked the obvious follow-up: **every shape where two arms of
a union can hold the same value is a candidate for the same bug.** Six families, driven against the
prebuilt compiler at `ec17c451`, each suspect then re-run by an adversarial verifier whose default
position was "not a defect".

**140 cells probed · 64 confirmed · 7 refuted · 1 family UNMEASURED.**

> **The `generic-and-alias` family never ran** — its probe agent stalled mid-stream. Generic
> instantiation making two arms coincide, and alias transparency (an alias and its application share
> ONE arena index), are therefore **unmeasured, not clean**. That is the first gap to close.

## Coverage by family

| family | probed | outcomes |
|---|---:|---|
| `newtype-over-base` | 34 | CHECK-REJECT 2, EMIT-REJECT 2, INVALID-WASM 1, RUN-OK 9, RUN-WRONG 20 |
| `struct-shape-overlap` | 15 | EMIT-REJECT 3, INVALID-WASM 2, RUN-OK 5, RUN-WRONG 5 |
| `literal-union-remaining` | 27 | CHECK-REJECT 2, EMIT-REJECT 2, RUN-OK 12, RUN-WRONG 11 |
| `nullable-and-arrays` | 44 | EMIT-REJECT 8, INVALID-WASM 8, RUN-OK 13, RUN-WRONG 15 |
| `function-and-mixed` | 20 | EMIT-REJECT 1, RUN-OK 10, RUN-WRONG 9 |
| `generic-and-alias` | **0** | **UNMEASURED — probe stalled** |

## The two general root causes

The 64 confirmed cells are not 64 independent bugs. They collapse largely onto two mechanisms, both
of which the sweep located in source and both of which are **newtype-free** — the newtype cells are
the easiest witnesses, not the cause.

### ROOT A — `emitIs` compares ONE tag, so overlapping arms are indistinguishable

`emitIs` (`compiler/wasmEmit.vl`) lowers `x is T` to a single box-tag compare,
`struct.get $box 0 == isArmTagOfTy(T)`, and `isArmTagOfTy` derives that tag from the atom KIND by
reading the arena PAYLOAD. A newtype brand is minted as a SECOND arena index over the SAME payload,
so `N` and its base get the SAME tag. Same for a literal-union alias and `string`.

The compiler already states the general form, in the comment #1340 added:

> *"the two arms OVERLAP, and a value belonging to both must answer TRUE to `is K` AND to `is string`
> — which ONE tag field cannot do."*

#1340 fixed the literal-union arm by making that test a MEMBERSHIP test over the payload. **The same
treatment has not been applied to any other overlapping shape.**

### ROOT B — `is` narrowing LAUNDERS a type past a live checker reject

This is the more serious of the two, because it is a **soundness** hole rather than a wrong answer.

`checkIsExprNode` (`compiler/typecheck.vl`) banks the TESTED type verbatim as the narrowed type
(`isVarTyIx[ix] = chkTy`) with no intersection against the arm the value actually inhabits. Its only
soundness gate is `assignable(chkTy, unionTy)` — which is true for **every** arm of the union. So the
narrowed binding is accepted in positions the checker otherwise rejects outright:

```vl
type Name = new string
function takesString(s: string): string { return s }
const n: Name = "bob"

print(takesString(n))              // vl check rc=1 — type error, correctly rejected

const x: Name | string = n
if x is string { print(takesString(x)) }   // vl check rc=0, runs, prints "bob"
```

Both halves re-run by the integrator at `ec17c451`. **The union + `is` route manufactures an unwrap
the language deliberately does not have** — `as` is numeric-only, so a `new string` newtype has no
legal unwrap at all.

Proven newtype-free with `type S = "a" | "b"`, union `S | string`, value `"zzz"`: the direct call is
`vl check` rc 1, the laundered one rc 0.

## What is NOT one of these

Several confirmed cells are **container variance**, not arm overlap — `K[]` flowing into a
`string[]` parameter that then writes a non-member, `{a,b}[]` into a `{a}[]` that writes a bare
`{a}`. Those belong to the **N5/A8/A9 variance ruling** already recorded in `open-rulings.md`, and
they are further evidence for it rather than a new family.

At least one cell graded `RUN-WRONG` by the sweep is actually `INVALID-WASM` on re-run
(`const a: i32[] = [1,2]; const b: f64[] = a` — `vl check` rc 0, `vl run` fails to build). Loud, not
silent, and still a `vl check` hole.

## The root-cause partition — done, and it changes the priority

Classified by what each minimal repro DOES rather than by keyword (a first keyword pass left 39
unclassified and is not the number to quote):

| root cause | cells | |
|---|---:|---|
| **ROOT A** — one tag cannot separate overlapping arms | **49** | a wrong `is` answer |
| ~~**ROOT B**~~ — `is` narrowing launders past a live reject | ~~9~~ | **CLOSED #1343 — and it was bigger than this table says** |
| N5 container variance | 6 | already an open ruling, not this family |

Per family: newtype-over-base A 13 / B 8 · struct-shape-overlap A 6 / B 1 · literal-union-remaining
A 11 · nullable-and-arrays A 12 / N5 5 · function-and-mixed A 7 / N5 1.

**ROOT A is 5x the population, but ROOT B is the one to fix first.** A wrong `is` answer is a bug in
one expression; a laundered narrowing lets a program call a function the checker rejects one line
earlier, so it converts a type error into whatever the callee does with a value of the wrong rep.
ROOT A also has a known shape of fix already shipped once (#1340's membership test) while ROOT B has
none.

Note the two are **not independent**: every ROOT B witness is also a ROOT A witness, because the
laundering is only reachable through an `is` that answered wrongly. Fixing A may reduce B's
population without closing it — B's gate (`assignable(chkTy, unionTy)`, true for every arm) is
wrong regardless of what the tag compare answers.

## Method notes worth keeping

- **The adversarial verify stage earned its place**: 7 suspects were refuted on re-run, several
  because the prober's "expected" answer was wrong about VL's actual rule rather than because the
  compiler was right.
- **Every probe carried an inverted control**, and the confirmations cite theirs — e.g. the
  laundering cells each pair with the direct call that IS rejected. A cell whose control does not
  move is unmeasured, not clean.
- **A filing's stated mechanism can be wrong for months while its symptom is real.** The tag-band
  framing survived because nobody built it; #1340 built it and it was 2 cells up, 3 down.


---

## The `generic-and-alias` family, recovered — and it found a defect that is NOT an overlap bug

The family recorded above as UNMEASURED was re-probed. Its agent also stalled, but 25 probe cells
survived on disk and were **re-run from scratch by the integrator** rather than taken on report.

Most of the family is clean or correctly rejected: 8 RUN-OK with their inverted controls moving,
11 CHECK-REJECT, 4 EMIT-REJECT. **No new overlap/tag defect was found here.** That is a real result
for ROOT A — generic instantiation and alias transparency do *not* appear to manufacture the tag
collision, which is worth knowing before generalising #1340's membership test.

**But one cell is a live soundness hole of a different kind.**

```vl
type Box<T> = { v: T }
type U = Box<Box<i32>> | i32
const u: U = { v: 5 }        // vl check rc 0 — ACCEPTED, and it runs
```

`Box<Box<i32>>` is `{ v: { v: i32 } }`, so `{ v: 5 }` matches neither arm. It is accepted anyway.

**Three controls localise it exactly:**

| program | rc | |
|---|---:|---|
| the same union written WITHOUT generics — `{ v: { v: i32 } } \| i32` | **1** | correctly REJECTED |
| the nested application with NO union — `const b: Box<Box<i32>> = { v: 5 }` | **1** | correctly REJECTED: *"cannot assign `{v: i32}` to 'b' of type `{v: {v: i32}}`"* |
| the generic union with a CORRECT initializer — `{ v: { v: 5 } }` | 0 | correctly accepted |
| **the generic union with the wrong initializer** — `const`, and in ARGUMENT position | **0** | **ACCEPTED — the defect** |

So nested generic application resolves correctly on its own, and the union resolves correctly
without generics. **The hole is specifically a generic alias application appearing as a UNION
MEMBER.** The resulting value matches no arm — `if u is Box<Box<i32>>` answers NOT.

### The suspect, flagged as a LEAD and not a conclusion

`typecheck.vl:9054 unionMemberGenAppShape` is the union-member path for a generic application, and it
resolves the type and then **renders it back to a NAME**:

```vl
const ti = nameToTy(member)
if t is TyObj { return tyToEmitName(ti) }
```

That is a type round-tripped through a parsable string — exactly what the destringify programme
exists to remove — sitting directly beneath a soundness hole. **If confirmed, this is the strongest
argument the programme has produced**: a stringified type is not merely slow or ugly here, it is
load-bearing for a wrong answer.

Two reasons to hold it as a lead. `unionMemberGenAppShape` is already filed in the destringify
programme as bucket **4b, blocked on W9** (canon's name-in/name-out contract), so the connection is
plausible rather than novel. And the agent's own reading of the evidence — that `u.v` typing as
`{v: i32} | i32` "proves `u` became a single struct" — does **not** hold up: that is the correct
`.v` for `{v: {v: i32}}`, so it is not evidence of a swallow. **The defect is confirmed by the
controls above; the mechanism is not yet.**


---

## ROOT B is CLOSED (#1343) — and the mechanism recorded above was WRONG

The entry above locates ROOT B in `checkIsExprNode` banking the tested type verbatim, gated by
`assignable(chkTy, unionTy)`. The banking is real, but it is **not the hole**, and the union framing
in that sentence is an artifact of how the defect was found (through `K | string` witnesses) rather
than a property of the defect.

**`checkIsExprNode` applied its soundness gate only when the operand was a UNION or NULLABLE. A plain
operand was left ungated entirely.** The THEN branch narrows to the tested type either way, so an
ungated `is` hands the branch a binding of a type the value provably does not have — with **no union,
no tag and no overlap anywhere in the program**:

```vl
type Name = new string
const n: Name = "bob"
takesString(n)                        // vl check rc 1 — rejected
if n is string { takesString(n) }     // vl check rc 0 — ran, printed "bob"
```

So ROOT B was never a member of the overlapping-arm family at all; it was found through that family's
witnesses because an overlapping `is` is one way to reach it, not the only way. **No tag-compare fix
could have rescued it.** The scalar cases were worse than the newtype one: `i32 is string`,
`string is i32` and `i32 is i64` all passed `vl check` and emitted INVALID WASM.

Fixed by gating every operand. `TyVar` and `TyErr` are assignable in both directions by construction,
so generic parameters stay freely testable and an already-errored operand gains no second diagnostic.
**48 cells, 6 UP, 0 DOWN, 22 legitimate-narrowing controls unchanged.**

*The method note is the one this programme keeps re-learning: **the witnesses that find a defect
shape the story told about it.** ROOT B was filed as a union bug because every witness had a union in
it. The fix needed one line of gate and no union at all.*


---

## ROOT A's LARGEST POPULATION IS NOT AN OVERLAP — it is a REP COLLISION between DISJOINT arms

ROOT A's 49 cells were filed as one mechanism. They are not. A 59-cell grid — five populations plus
17 legitimate-narrowing controls, graded on `check` rc / `build` stderr TEXT / `run` stdout — splits
them on a question #1340's framing never asked: **do the two arms share VALUES, or only a
REPRESENTATION?**

| | `K | string` (#1340) | `N | i32`, `EntityId | PlayerSlot` |
|---|---|---|
| arms share values | **yes** — `K ⊆ string`, `"aa"` is both | **no** — the checker refuses both directions |
| arms share a runtime rep | yes | yes |
| a runtime predicate separates them | **yes** — membership over the payload | **NO — a brand has no runtime witness** |
| answer | re-lower `is` to a value test | **refuse the spelling** |

A nominal newtype is *defined* to be absent from the emitter (`newtype-design.md` §3): the brand is a
second arena index over the same `Ty`, and `canonEmitTypeNames` erases it before codegen. So `N` and
its base reach `emitIs`'s box tag identically and **both** `x is N` and `x is i32` answer TRUE, for a
value built through either arm. There is no membership predicate to write — a literal-union member is
a runtime-observable SUBSET of its base, and a brand is nothing at all at run time.

That makes the union a type the language cannot represent, and the shipped answer is a
declaration-time reject rather than a wrong `is`. **The tag scheme #1340 measured and rejected stays
rejected**: giving the arm its own tag requires the brand to survive into the emitter, which is the
entire cost the newtype design exists to avoid — a rep escalation, not a fix.

**The comparator is the member list's own dedup, applied one erasure down.** Both annotation routes
and the declaration route already drop a member that is `sameVariantTy` with one kept, so every
surviving pair is NOT mutually assignable; a pair whose ERASED forms then are can differ by nothing
but a brand. That is what bounds the rule without naming brands in it, and it is why index equality
alone was not enough — it catches a scalar base (one canonical arena entry per name) and misses a
structural one (`new i32[]` beside `i32[]`), where each resolution mints its own index.

**59 cells, 24 UP, 2 DOWN, 17 controls unchanged.** 19 RUN-WRONG and 5 EMIT-REJECT became
CHECK-REJECT. The 2 down are **masked, and proven so**: each is a `N | i32` program whose single
construction happens to agree with the wrong tag, and each has an inverted twin — the same program
with the value built through the other arm — that is RUN-WRONG on master. A cell whose inverted twin
moves is not a cell the shape decides correctly. Six-channel corpus A/B over 151 files (all 23
pre-existing newtype-declaring files plus a spread sample): **0 differences**. The rule is inert for
any program with no `new` declaration.

### What is still open, measured on the same grid

| population | cells | master grade | why not closed |
|---|---:|---|---|
| **struct arms, same field NAMES, i32-vs-boolean field types** | 3 | RUN-WRONG | a DIFFERENT mechanism, and localized: `emit_collect.vl`'s discriminability reject already refuses `{a:i32} \| {a:f64}` and `{a:i32} \| {a:string}` (verified), but `variantFieldCodesEq` compares STORAGE codes, and `boolean` and `i32` share one — so the pair is treated as the layout-equal twin the exemption is for, both members rank tag 0, and the WAT compares both `is` against `i32.const 0`. Its exemption is keyed on layout where it means IDENTITY. |
| **struct arms, same shape, width-subtype, or a named twin** | 3 | EMIT-REJECT | already loud; a clean checker diagnostic would be an improvement, not a defect closure |
| **function-type arms** (arity / param / return differ) | 3 RUN-WRONG + 1 EMIT-REJECT | RUN-WRONG | unprobed mechanism; the closure fat-pointer's arm tag is a separate table from the value-atom tags this slice touched |
| **literal-union shapes #1340 did not reach** | 5 | RUN-WRONG | `is K` answers FALSE where #1340's membership test should fire: a NUMERIC literal union beside `i32`/`f64`, two literal unions sharing a member, and the INLINE (unaliased) spelling beside `string`. The gate is `nameIsLitUnionArmValueUnion` on the union NAME — the closest thing to a ready template in the tree, and the population most likely to close with #1340's own shape |

One grid oracle was corrected while measuring: three P5 cells were written expecting `is K` and
`is <base>` to be mutually exclusive. They are not — that IS #1340's rule, and a member is a member of
both. The grades did not move, but the `want` column did.

*Method note this slice adds: **an inverted twin is what tells a masked cell from a correct one.** Two
of the newtype cells graded RUN-OK on master and would have read as over-rejection; their twins,
built through the other arm, are RUN-WRONG, which is what makes those two cells part of the defect
rather than casualties of the fix.*
