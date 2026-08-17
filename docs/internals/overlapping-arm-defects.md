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
| ~~**struct arms, same field NAMES, i32-vs-boolean field types**~~ | ~~3~~ | RUN-WRONG | **CLOSED — see the section at the end of this file. The filed mechanism was right and the filed SCOPE was too small.** |
| **struct arms, same shape, width-subtype, or a named twin** | 3 | EMIT-REJECT | already loud; a clean checker diagnostic would be an improvement, not a defect closure |
| ~~**function-type arms** (arity / param / return differ)~~ | ~~3 RUN-WRONG + 1 EMIT-REJECT~~ | RUN-WRONG | **MEASURED — see the D6 section at the end of this file. The population is 72 of 380, and the "separate table" note is refuted by the disassembly: a function type is slot 11 of the shared value-atom band.** |
| **literal-union shapes #1340 did not reach** | 5 | RUN-WRONG | `is K` answers FALSE where #1340's membership test should fire: a NUMERIC literal union beside `i32`/`f64`, two literal unions sharing a member, and the INLINE (unaliased) spelling beside `string`. The gate is `nameIsLitUnionArmValueUnion` on the union NAME — the closest thing to a ready template in the tree, and the population most likely to close with #1340's own shape |

One grid oracle was corrected while measuring: three P5 cells were written expecting `is K` and
`is <base>` to be mutually exclusive. They are not — that IS #1340's rule, and a member is a member of
both. The grades did not move, but the `want` column did.

*Method note this slice adds: **an inverted twin is what tells a masked cell from a correct one.** Two
of the newtype cells graded RUN-OK on master and would have read as over-rejection; their twins,
built through the other arm, are RUN-WRONG, which is what makes those two cells part of the defect
rather than casualties of the fix.*
---

## The litunion remainder, measured — the filed shape was wrong twice

Probed on master @42bcd627 with a seed refreshed from that source. Every cell below is `vl check
--codegen` **rc 0** — a silent wrong answer, not a diagnostic.

### The trigger is a litunion ALIAS as the TESTED type, not a shared member

The ranking called this shape "two litunions sharing a member". The shared member is irrelevant, and
so is the count of arms carrying values:

| probe | `is` answers | correct? |
|---|---|---|
| `type A = "x"\|"y"`, `type B = "z"\|"w"` (**disjoint**), `u: A\|B` → `u is A` | FALSE | ❌ |
| same, `u is B` | FALSE | ❌ |
| `type A`, `type B` **sharing** `"y"`, `u is A` | FALSE | ❌ |
| both arms, both directions, `const`/`let`/**parameter** receivers | FALSE | ❌ |

Disjoint fails identically to overlapping, and **both arms** answer FALSE — so the union is not
mis-discriminated, it is **un**-discriminated. It fails CLOSED (an `if` branch that never runs),
which is a different and safer class than #1344's newtype cells (a value laundered into the wrong
type).

### The isolating probe

One receiver, one union, one value, two spellings of the same test:

```vl
type A = "x" | "y"
type B = "z" | "w"
function probe(u: A | B) {
  if u is "x" { print("lit:yes") } else { print("lit:no") }       // lit:yes    ✅
  if u is A   { print("aliasA:yes") } else { print("aliasA:no") } // aliasA:no  ❌
  0
}
probe("x")
```

The membership semantics are HEALTHY — the bare-literal spelling answers correctly on the identical
value — and the test folds to `i32.const 0` (confirmed in the disassembly).

**This is not ROOT A.** ROOT A is "one tag cannot separate overlapping arms". Here there is no tag
compare to get wrong and no overlap to separate.

### The third wrong mechanism: the receiver is a STRING, not an atom

The filing above reasoned from "the receiver is a compact interned atom, so the atom membership
ladder exists and the alias spelling merely fails to reach it", and named two classifiers
(`exprIsLitAtom`, `unionNameOfIdentSid`) as the things to widen. **The disassembly refutes it.** For
`function probe(u: A | B)` the param is `(param (ref $1))` — an array-of-i32 STRING — and the working
`u is "x"` one line above lowers to a `__str_eq__` call, not to an `i32.eq` against an interned id.
Widening `exprIsLitAtom` to claim this shape would have emitted the atom ladder's `i32.eq` against a
string ref: invalid wasm, traded for a wrong answer.

**Both reps exist, and `nodeTyIsLitUnionAlias` decides which.** The atom valtype ladders carry a
literal union only where its emit-time spelling is a registered alias NAME; `ctxKeepsLitUnion` is
false at `RC_ROOT` and `RC_FN_PARAM`, so a litunion with no alias of its own — the flattened `A | B`,
and the bare inline spelling — stays a string there. The receiver classifiers key on that same alias
test, so classifier and valtype ladder AGREE: neither is wrong, and there was no classification gap
to close. What was missing is the `is` lowering for the string rep.

That lowering is the same MEMBERSHIP the atom ladder emits, through string equality instead of
interned-id equality: `recv == "m0" || recv == "m1" || …`. Absent it the guard fell to
`monoStaticIsResult`, which sees a non-union REP and a tested name that is no variant row, and
answered the constant FALSE.

### The three reps of a litunion `is`, which is what bounds the cut

| union | rep | `is A` lowering |
|---|---|---|
| `A \| string`, `A \| i32`, `A \| string \| i32` | value-union BOX | tag-gated payload membership (#1340's `nameIsLitUnionArmValueUnion`) |
| `A` alone, or a `K`-typed field / element / map value | interned i32 ATOM | `id == m0 \|\| id == m1 \|\| …` |
| `A \| B`, and the inline `("a"\|"b") \| ("c"\|"d")`, at `RC_ROOT` / `RC_FN_PARAM` | member STRING | `recv == "m0" \|\| recv == "m1" \|\| …` |

#1340's gate is reached only when a NON-litunion arm forces the box. Two litunion aliases flatten to
an all-literal member set, which carries no box at all — so the third row is a rep neither #1340 nor
slice C's atom work had a lowering for.

**CLOSED**, both arms, disjoint and overlapping member sets, the inline spelling, and param /
`const` / `let` / reassigned-`let` / module-global receivers. Pinned by
`tests/cases/literal-unions/is-alias-arm-of-flattened-litunion.vl`, which scores 18 wrong lines
without the fix.

### What the cut does NOT reach

CONSUMING a string-repped receiver once it is NARROWED to an alias — `if u is K { const r: K = u }`,
or passing the narrowed value to a `K` param — is invalid wasm, before and after: the narrowing
rebinds to `K`, whose slot is an ATOM, while the value is a string ref. That is a valtype-ladder
hole, not an `is` hole, and it is the same inline-spelling PARAM/FIELD work
`docs/internals/destringify-types-program.md` files.

**That filing is CLOSED — see "D1a is CLOSED" and "the narrowed-consumption re-grid" below. The
classification held exactly; the re-grid's finding is that everything still failing on that path
fails with the `is` deleted.**

Adjacent and separately unmeasured until now: a plain `string` receiver tested against a literal
union (`function f(s: string) { if s is A … }`) is `vl check`-clean and also answers a constant
FALSE. The receiver is the same string rep and the same lowering would serve it; it is a different
receiver POPULATION (a narrowing of `string` down to a subset, not a union arm test), so it is filed
rather than bundled.

**That filing is CLOSED and was a THIRD of its own population — see "the non-litunion receiver"
below.**

## The non-litunion receiver, measured — the filing was a third of it

A 233-cell grid (7 receiver types × 5 tested-against spellings × 5 test forms, a 5-origin second
grid, and 19 rep-crossing cells) over the filed shape. Baseline **82 silently wrong**, 56
check-rejects, 17 `vl check`-clean emit-rejects, 78 clean. After the cut: **0 silently wrong**, 155
clean, 56 check-rejects (unchanged — no reject-parity movement), 22 emit-rejects.

The filed cell — `s: string`, `if s is A` — is 16 of those 82. The rest:

| receiver | baseline | why |
|---|---|---|
| plain `string` (param / `let` / field / element / global / nested fn / `.slice`) | const **FALSE** | no rep path claimed it; it fell to `monoStaticIsResult` |
| un-annotated param monomorphized to `string` | const **FALSE** | same |
| `string \| null` NARROWED by `!= null` | const **FALSE** | same |
| **`string \| i32` — a value-union BOX whose one string arm is not the tested type** | const **TRUE** | the box-tag compare: a litunion tested type claims kind 2's tag, the SAME tag a plain `string` arm claims |

The last row is the one the filing could not have predicted, and it is the opposite sign. The
existing litunion floor already knew the tag compare is unsound over a box with **two** string-repped
arms; its stated exemption — "`K | i32` reaches kind 2 only through `K`, so the tag decides it
exactly" — assumes the one string arm **is** the tested type, and nothing enforced that.

**The oracle was always one line away.** `s is "m0"` answers correctly on every one of these
receivers; only `s is K` did not. So the cut is not a new lowering: it is ONE per-member compare
(`emitLitMemberEq`) shared by the bare-literal spelling and the membership ladder, placed ahead of
the box-tag compare. The two spellings now emit the same bytes by construction and cannot disagree.

Two bounds the grid set rather than reasoned:

- **The fold-to-TRUE needs a PURE literal-union receiver.** `nodeLitMembersWithin` reads only the
  STRING literal members, so over the mixed `"b" | 1` — what an else-if chain narrows `"a" | "b" | 1`
  to — it reports "all mine are yours" for the tested `"b"` and folds a guard the value `1` must
  answer FALSE to. `soundness/exhaustive-is-chain-no-else-returns.vl` caught it.
- **A box the per-member compare cannot lower keeps the tag compare.** `emitUnionLitIs` declines a
  union with a STRUCT arm, and for `K | { w: i32 }` the tag compare is EXACT. Pre-checking that
  helper's own rejects at the gate is what keeps a working shape working instead of converting it
  into a hard emit failure — 7 corpus cases said so.

Non-place receivers (a call, a concat, a `.slice`) with a two-or-more-member tested type have no
membership lowering and no spill slot, so they take the **loud floor** the box rep already had; the
two floors now share one message. A one-member tested type evaluates the receiver exactly once and is
unaffected.

**Still open, and it is a RULING not a lowering:** a RAW `string | null` receiver (16 cells) stays a
loud `vl check`-clean emit-reject. Its bare-literal twin `(string | null) is "x"` **traps on a null
receiver** — measured — so membership cannot delegate to it, and making both answer FALSE for null
changes shipped `is` semantics. Filed as D1c.

Pinned by `tests/cases/literal-unions/is-litunion-over-string-receiver.vl` (15 wrong lines without
the cut) and `is-litunion-string-call-receiver-rejected.vl` (compiles and answers FALSE without it).

### Numeric literal unions are a separate, deeper cut

`type K = 1 | 2` / `type K = 1.5 | 2.5` beside `i32` / `f64` also answer FALSE, but for an unrelated
reason: `tyIsLitUnion` requires **every** member `litKind == "str"`, and `tyLitMemberTexts` collects
only `"str"` members. VL models `"str"`, `"flt"` and integer literal types (`litBaseTy`), so the whole
litunion machinery — classification AND member extraction — is string-only by construction. A numeric
litunion is not a "litunion" anywhere in the compiler, so no gate declines it; it is never a candidate
at all. Fixing these is not the same change as the alias-resolution cut above, and should not be
bundled with it.

*Method note, again: **the witnesses shape the story.** This family was filed from cells that all had
a shared member, so the shared member entered the description; it turned out to be a coincidence of
how the probes were written. The one-line disproof — swap the members to disjoint sets and rerun —
cost less than the reasoning that preceded it.*

**CLOSED — see the section at the end of this file.** The filed mechanism is exactly right; what it
does not say is that the answer is a FOURTH rep with its own lowering, and that the shape reaches two
reps rather than one.

*And the note the third filing adds: **a claim about a REP is only worth what the disassembly says.**
"The receiver is an atom" was asserted from the type's classification (`tyIsLitUnion` answers YES for
the flattened member set) and never read off the emitted module; the valtype is decided one predicate
further on (`nodeTyIsLitUnionAlias`) and says STRING. Two named classifiers were queued for widening
on the strength of it, and widening either would have shipped invalid wasm. `wasm-dis` on the
function costs one command.*


---

## D5 (`{a:i32} | {a:boolean}`) is CLOSED — the mechanism was filed right, the SCOPE was filed small

The "still open" table above calls this population **3 cells** and pins the mechanism in one line:
*"Its exemption is keyed on layout where it means IDENTITY."* That sentence is exactly right, and it
is the whole fix. What the filing got small is how far the sentence reaches.

### The exemption's live population — measured, not assumed

`assignTags` rejects two variants of one union that share a field-NAME set (`variantSig`, which IS
the tag key) *unless* the field comparator says they are one variant. Before asking what the
comparator should compare, the question worth answering is **what the exemption is FOR**, and that is
measurable: replace the exempt arm with an `emitFail` and sweep the corpus.

**3 of 1,743 `tests/cases` files, and nothing else:**

| file | the twin it needs |
|---|---|
| `types/struct-union-same-shape.vl` | `type A = {tag:i32,v:i32}` / `type B = {…}` identical, `A \| B` at a PARAM slot |
| `types/struct-union-same-shape-field-slot.vl` | the same pair at a struct-FIELD slot |
| `soundness/union-same-shape-discriminant-sound.vl` | the `kind`-field discriminant idiom over two identical shapes |

All three are one contract: VL is structurally typed, so two `type` aliases with the same shape are
**the same variant** — a `B` genuinely IS an `A`, `is A` is soundly always true, and the arena
already collapses the union (`sameVariantTy`). That is a real rule with a real population, which is
why the exemption cannot simply be deleted.

### Why the comparator was wrong, in the terms the population sets

The exemption meant *"these two arms ARE one variant"* and was implemented as *"these two arms STORE
the same way"* (`variantFieldCodesEq` over the wasm-type CODE column). One code covers several VL
types — `i32` and `boolean` are both code 0 — so a pair that is two variants presented as one.
The fix is a per-field **type TEXT** column on the variant table (`uFieldTyText`), recorded by the
one field-row home from the same two provenances the map-KEY column already uses, and read by the
renamed `variantFieldTysEq`.

A transparent alias is not a false reject and this is the route with no other pin in the corpus:
`canonEmitTypeNames` rewrites every annotation into its canonical emit name before any emit pass, so
`type Id = i32` arrives in the column as `"i32"` and `{a: Id} | {a: i32}` stays the one variant it is.
`unions/variant-twin-scalar-spellings.vl` now pins that route alongside the two-declared-names and
declared-vs-inline routes.

### The count, and what "3 cells" missed

The 3 is not reproducible from this document — the cells were never enumerated — so the shape was
re-gridded from scratch: **15 cells, 6 UP, 0 DOWN, 9 unchanged** (3 already-rejecting controls, 6
twin-exemption controls).

The 6 that moved RUN-WRONG → EMIT-REJECT are the declared spelling and the inline spelling, **both
arm orders**, a carrier with a second matching field, and — the one the filed description does not
name — **`{a: i32[]} | {a: boolean[]}`**. The defect is not "i32-vs-boolean field types"; it is *every
storage code that covers more than one type*, and code 4 (the i32-backed list) is the second such
code the corpus can reach. The 3 unchanged rejecting controls are the pairs whose difference the
ELEM-NAME column already carried: a literal-union field beside `i32`, a map field differing in its
VALUE, and `i32 | null` beside `boolean | null`.

Both arm orders being wrong is what makes this a defect rather than a masked cell: there is no
construction of this union that the tag scheme decides correctly, so no inverted twin rescues it.

### What is NOT affected, and why it did not need the same change

`variantFieldLayoutEq` — the `mAssignTypeIndices`-time sibling that folds twins into one heap type —
looks like it has the same confusion and does not: `buildVariantTwins` calls it only where
`repNameCanonKey` has already matched off the ARENA, so identity is established before layout is
consulted. Storage-vs-identity is only a confusion where nothing else establishes identity, which at
`collectU` time is the case for exactly this comparator.

*Method note this closure adds: **ask what an exemption is FOR before deciding what it should
compare, and answer it by poisoning the arm rather than by reading it.** The three files the sweep
named state the structural-typing contract in their own headers; no amount of staring at
`variantFieldCodesEq` would have produced them, and without them "just delete the exemption" reads
like a defensible option.*


---

## D2 (numeric literal unions) is CLOSED — the machinery was not half-converted, a FOURTH rep was added

The filing above is right about the cause and says nothing about the answer, and the two are not the
same question. This section records what the answer turned out to be, because the obvious reading of
that filing — *"widen `tyIsLitUnion` and `tyLitMemberTexts` to the numeric kinds"* — is the
half-converted classifier the rest of this document warns about, and it would have shipped invalid
wasm.

### The rep, from the disassembly, before any lowering was written

| spelling | valtype of the binding | `is K` on master |
|---|---|---|
| `type K = 1 \| 2`, `const k: K` | `(local i32)` | `i32.const 0` — folded FALSE |
| `const x: K \| i32` | `(local i32)` — **no box, no tag** | `i32.const 0` |
| `type K = 1.5 \| 2.5`, `const x: K \| f64` | `(local f64)` — no box | `i32.const 0` |
| `const x: K \| string` (K numeric) | `$uBox {i32, anyref}` | loud emit reject |
| *(control)* `type K = "a" \| "b"`, `const x: K \| string` | `$uBox` | tag + `__str_eq__` membership |

The mixed `K | i32` and `K | f64` unions **collapse to their base scalar entirely** — every member
softens to the one scalar, so the union has one rep and carries no discriminant at all.
`literal-unions/numeric-litunion-alias.vl` already pinned that contract for READS; what it did not
say is that it makes `is` a value question with no tag to consult.

**That is why widening `tyIsLitUnion` would have been wrong.** `tyIsLitUnion` is not "is this a union
of literals" — it is the **ATOM-rep classifier**, read by ~25 sites across `emit_rep` / `emit_classify`
to claim the interned-i32-atom valtype ladder. A numeric litunion does not rep as an atom; it reps as
its base scalar, and the compiler already says so in a different vocabulary (`numLitUnionBaseName`,
`softenLitTy`, `unionParamPinName`'s numeric arm). Making the string-only predicate answer YES for
numeric member sets would have handed the atom ladder an `f64`.

So the classification gap in the filing is real and the fix for it is **not** to close it in place.
The two extractors partition the literal KINDS exactly as the two REPS do, and the numeric side got
its own pair (`tyNumLitMemberTexts`, `nodeNumScalarBaseName`) rather than a widened one.

### Two arms, because the shape reaches two reps

- **unboxed** (`K`, `K | i32`, `K | f64`, `K | i64`, `A | B`, the inline `(1|2) | i32`): membership
  over the value, `x == m0 || x == m1 || …`, in the base's own compare.
- **boxed** (`K | string` — a numeric litunion beside a different rep): the tag-gated payload compare
  `emitUnionLitIs` per member, ORed. This is the numeric twin of #1340's arm and membership for the
  same reason: `K ⊆ i32`, so the arm shares kind 0's tag with any `i32` arm.

**The unboxed arm checks BOTH bases and requires them to agree** — the tested type's
(`numLitUnionBaseName`) and the receiver's (`nodeNumScalarBaseName`, which also claims the mixed
spellings the tested side never carries). Without the receiver half, a monomorphized `g<T>(v: T)`
instance pinned to `string` takes the arm and compares a `(ref $array)` with `i32.eq`: invalid wasm
traded for a wrong answer, which is precisely the trap #1345's filing walked into by asserting a rep
instead of reading one. It is also what keeps an i64 receiver off an i32-based member set.

### The second cell, which the filing did not predict

The un-aliased spelling `x is 1 | 2` was wrong for an unrelated reason: `isLitVariantName` decides on
the tested spelling's FIRST CHARACTER, so a multi-member inline set is a "literal" to it and lowered
as the single compare `x == 1` — **every non-first member silently dropped**. Putting the membership
arm AHEAD of the bare-literal arm fixes it, and costs that arm nothing: a tested type that really is
one literal reaches the same `emitNumLitEq` and emits the same bytes.

**14 cells, 8 UP (6 silent RUN-WRONG + 2 EMIT-REJECT → correct), 0 DOWN, 6 controls unchanged.**
Corpus `deno test -A tests/cases_wasm_test.ts` 1,683 passed / 0 failed / 7 ignored; align 1,690
passed / 0 failed / 0 ignored. Pinned by `tests/cases/literal-unions/is-numeric-litunion-membership.vl`
and its control `is-string-litunion-reps-unmoved.vl` (all three string reps, one group each).

### What is still open, measured on the same grid

**The `K | i32` PARAM slot is a REP hole, not an `is` hole, and it is loud.** A param annotated
`K | i32` classifies as a BOXED union (`exprUnion` true, `paramUnion`) while `RC_ROOT` gives the
identical type a plain scalar local. It fails at emit **with no `is` in the program at all** —

```vl
type K = 1 | 2
function probe(x: K | i32) { 0 }
probe(1)          // emitProgram: union box atom test on a union with no recorded members: i32
```

— so every param-receiver cell of this family is blocked behind it, and no `is` lowering can reach
them. Filed rather than bundled: reconciling the param classifier with the root valtype is a rep
change.

**A non-IDENT receiver with a 2+ member set still answers a constant FALSE** (`s.f is K`, `src() is K`).
Both arms bound the receiver with `unionEqOperandOk` because each member re-reads it, which is the
same bound the atom ladder and #1345's string arm carry. It fails CLOSED and has a one-line
workaround (bind to a local first, which then answers correctly).

**And the string side of that same position is WORSE, which is a new measurement.** A struct-FIELD
receiver of a STRING litunion answers `is K` **TRUE for a non-member**:

```vl
type K = "a" | "b"
type S = { f: K | string }
const s: S = { f: "zz" }
if s.f is K { … }   // TAKEN — vl check --codegen rc 0
```

The member cell of the same shape answers TRUE as well, so a test that looked like it worked is a
constant fold reading the receiver's own type as within the tested set. Fails OPEN, unlike everything
this slice touched. Not bundled — it is #1345's population, not this one, and it wants its own grid.

*Method note this closure adds: **a classification gap is not automatically a classification fix.**
The filing named two string-only predicates and the natural next sentence is "widen them". They are
string-only because the STRING rep is what they select, and the numeric shape's whole problem is that
it has a different rep — so the gap closes by adding the missing rep's lowering, not by making the
existing rep's classifier lie about what it selects. The tell was available before any code: the
compiler already carried a numeric-base vocabulary (`numLitUnionBaseName`, and `unionParamPinName`'s
arm saying in prose that a numeric litunion "falls past `tyIsLitUnion` into the boxed loop below — a
rep it does not have"). Grep for the vocabulary the other rep already speaks before widening the one
in front of you.*


---

## D1b is CLOSED — the fail-OPEN cell was one of SIXTEEN, and the bound was never IDENT-ness

D1b was filed as one cell: a struct-FIELD receiver of a `K | string` answering `is K` TRUE for the
non-member `"zz"`, `vl check --codegen` rc 0. Re-verified on master's seed, then re-gridded:
**9 receiver forms × 5 union shapes = 45 cells**, each carrying its member and its non-member value
so a wrong answer cannot hide behind the one construction that happens to agree.

### The population — measured on master's seed

| receiver | `K \| string` | `K \| string \| i32` | `K \| null` | `K` (bare) | `K \| i32` |
|---|---|---|---|---|---|
| local / param / module global (IDENT) | ok | ok | ok | ok | ok |
| bound map read (`const r = m[k]`) | ok | ok | ok | ok | ok |
| **struct field `s.f`** | **OPEN** | **OPEN** | closed | ok | ok |
| **nested field `s.g.f`** | **OPEN** | **OPEN** | closed | ok | ok |
| **array element `a[0]`** | **OPEN** | **OPEN** | closed | ok | ok |
| **direct map read `m[k]`** | **OPEN** | **OPEN** | ok | ok | ok |
| **optional chain `s?.f`** | **OPEN** | **OPEN** | closed | closed | ok |
| **call result `src()`** | **OPEN** | **OPEN** | closed | ok | ok |

OPEN = a branch that RUNS on a non-member. closed = a branch that never runs. **12 open cells, 4
closed**, against a filing of one. The direct map read is a receiver form the filing does not name
at all and it is in the open class.

`K | i32` is a whole COLUMN of correct answers and it is the column that explains the defect: a
`K | i32` box reaches kind 2's tag only through `K`, so the tag compare decides it exactly. The
defect is not "a field receiver"; it is **two arms sharing one tag**, which is #1340's own finding
one receiver form further out.

### The mechanism — one predicate, and it was asking the wrong question

`emitIs`'s litunion MEMBERSHIP arm (#1340) is gated by `unionEqOperandOk`, whose whole body was
`if e is Ident { return true }`. Every other receiver fell past the membership arm into the bare
box-tag compare one arm below it, which is the lowering #1340 measured and rejected.

The bound those lowerings actually need is that the receiver is a **PLACE** — re-evaluable without
effect, because `emitUnionLitIs` reads it twice per member (tag, then payload). A field path, an
optional-chain link and an element/map read are places exactly when their receiver — and, for an
element read, its SUBSCRIPT — is. That is the predicate now, and it is what moves 6 of the 12 open
cells plus 2 of the closed ones (the atom ladder's hand-rolled `laRecv is Ident` copy of the same
bound is routed through it).

### The residue is FLOORED, not left open

A call result and an optional chain are not places, and there is no scratch slot reserved for this
shape, so there is no membership lowering to give them. They now hit a loud emit reject instead of
the tag compare that is *known* to answer wrongly: **`unionStrArmCount` is the discriminator** —
one string-repped arm and the tag decides the question exactly (`K | i32` keeps its exact bytes);
two or more and it cannot, so there is nothing correct to emit.

**16 cells moved, 0 down. 12 silent wrong answers are gone: 6 now correct, 4 loud, and the 2 closed
field cells now correct.** Corpus `deno test -A tests/cases_wasm_test.ts` 1,708 passed / 0 failed /
7 ignored; align 1,715 passed / 0 failed / 0 ignored; opt+release 41 passed / 0 failed / 0 ignored.
Pinned by `tests/cases/literal-unions/is-litunion-arm-non-ident-receivers.vl` (7 wrong lines on
master's seed) and `is-litunion-arm-call-receiver-rejected.vl` (master ran it and printed `yes` for
`"zz"`).

### What is still open, measured on the same grid

**4 fail-CLOSED cells, all in the ATOM ladder, none of them fail-open.** `a[0] is K` over a
`(K | null)[]`, `src() is K` over a `K | null` return, and both optional-chain cells (`s?.f is K`
over `K | null` and over a bare `K` field). The atom ladder's receiver classifier
(`exprIsLitAtom`) has no arm for a NULLABLE litunion element read and none for an optional chain,
so the ladder is not reached and the guard const-folds FALSE. Different classifier, same shape of
answer as the string side; not bundled because closing it is `exprIsLitAtom`/`exprNulLitUnion`
work, not `emitIs` work.

**The membership lowering for a NON-place receiver is unbuilt, and it wants a rep decision, not a
patch.** Either the receiver spills to a reserved scratch slot — which puts this shape into the
reservation-SCAN discipline that `emitAtomToStr`'s own comment calls this emitter's richest
invalid-wasm vein — or `emitUnionLitIs` grows a form that reads the box once. Both are bigger than
the floor, and the floor is not a placeholder: it is the correct answer until one of them exists.

*Method note this closure adds: **a filing that names a receiver names a witness, not a
population.** D1b was filed at "struct field" because that is where it was found. The grid that
asked all nine receivers found the direct map read in the same fail-open class and found a whole
column (`K | i32`) that is CORRECT — and it is that correct column, not the broken ones, that
identifies the mechanism as tag-sharing rather than receiver-shape.*


---

## D1a is CLOSED — and it was a ladder arm, exactly as the D1 report predicted

D1a: `if u is K { const r: K = u }` over a STRING-repped litunion is invalid wasm before and after
the D1 fix — `type mismatch: expected i32, found (ref $type)`. The report called it *"a valtype-ladder
hole, not an `is` hole"*, and said the fix shape would differ from D1's. Both halves hold.

### The rep, from the disassembly, before any lowering was written

`function probe(u: A | B)` gets `(param (ref 1))` — an array-of-i32 STRING. The `is A` guard is the
`__str_eq__` membership #1345 shipped, and it is correct. The narrowed binding `const r: A = u` gets
`(local i32)` — `A` is a registered alias, so its slot is the interned ATOM. `local.get 0`
(a `(ref $array)`) into `local.set 1` (an `i32`) is the whole defect.

### The population — 6 destinations × 3 spellings

| consumption site | `A \| B` param | `A \| B` local | inline `("x"\|"y") \| ("z"\|"w")` | control: `u: A` (atom) |
|---|---|---|---|---|
| `const r: A = u` | INVALID | INVALID | INVALID | ok |
| `takesA(u)` (a `K` parameter) | INVALID | INVALID | INVALID | ok |
| `{ f: u }` (a `K` field) | INVALID | INVALID | INVALID | ok |
| `[u]` (a `K[]` element) | INVALID | INVALID | INVALID | ok |
| `retA(u)` (a `K` return) | INVALID | INVALID | INVALID | ok |
| `r = u` (assign a `K` local) | INVALID | INVALID | INVALID | ok |
| *controls:* `const r = u`, `print(u)`, `u == "x"`, `"v=" + u` | ok | ok | ok | ok |

**18 INVALID-WASM cells, 22 controls.** The four control sites are exactly the ones where no
atom-typed slot is involved and the value stays a string — which is what says the defect is the
REP BOUNDARY and not the narrowing.

### The answer: `emitStrToAtom`, and the reason it needs no scan

`emitAtomToStr` already existed — an atom widened to its member string, a `select` tower over the
interned ids. The missing arm is its INVERSE: a `select` tower picking member `i`'s id when the
value string-equals member `i`, last member unconditional (membership is checker-guaranteed).

The one design decision worth recording is that it **stashes nothing**. `emitAtomToStr` parks its id
in the str-op scratch frame and therefore has to be agreed with by a reservation SCAN — the failure
mode its own comment calls *"this repo's richest invalid-wasm vein"*. The inverse re-reads the value
per member instead: it pays the `unionEqOperandOk` bound and buys the entire scan out of the change.
`gHelpStrEq` needs no gate of its own — it rides `aUsed`, which a string-repped litunion makes true
by existing.

**ONE hook closes all six destinations**, in `emitExpr` under `pendingLitUnion`, because that flag is
already the context every atom-typed slot seeds. The two declines are the two things that are already
atoms there: an `exprIsLitAtom` expression, and a member string LITERAL whose id the `StrLit` arm
folds at compile time.

**18 cells UP, 0 DOWN, 22 controls unchanged.** Pinned by
`tests/cases/literal-unions/narrowed-string-rep-litunion-consumption.vl`, whose `atomForms` control
is the same six sites over an already-atom receiver.

### What bounds it, and what the checker bounds for us

`emitStrToAtom` floors loudly on a non-place receiver, and that floor is **unreachable from source
today**, because the receivers that reach it are places. What the checker narrows is measured rather
than assumed: a FIELD path narrows and consumes correctly at all six destinations (`if so.g is A
{ const r: A = so.g }`, and the nested `so.o.h`), a module GLOBAL does, and an ELEMENT place does
NOT (`if xs[0] is A { … }` is `cannot assign "x"|"y"|"z"|"w" to 'r'` — workboard D1f). The bound is
stated because it is the lowering's real precondition, not because a program can reach it.

*Method note: **the D1 report's own classification was the load-bearing part of this fix.** It said
valtype ladder, not `is`, and the vocabulary to look for followed directly — `emitAtomToStr` is one
grep from `emitStrValue`, and finding a direction that already exists tells you the missing one is
an arm and not a rep change. The alternative reading of the same symptom — "make the `A` slot hold a
string" — is a rep change, and it is refuted by the destinations: a `K` parameter, field, element and
return all have their rep fixed by a signature the binding cannot influence.*

### The narrowed-consumption re-grid — 1,156 cells, and the defect that was left is not the narrowing

The 18-cell grid above is the DESTINATION axis at one guard shape and three spellings. Re-gridded
across every axis the row named: **10 receiver reps × 6 guard forms × 8 consumption sites** (450
cells, re-run at a 3-member alias for another 450), a **20-origin × 10-destination** grid (200), and
**56 shapes** the first three cannot reach — seven place receivers narrowed IN SITU, subset and
alias-identity narrowing over an atom, a nullable litunion, a closure body, a generic callee, a
global destination, an else-if chain, a `for`-loop binding and a re-narrowing.

**0 silently wrong. 0 invalid wasm attributable to the narrowing.** Every invalid-wasm cell in the
grid reproduces with the `is` guard **DELETED** — which is the test that separates this row's
population from its neighbours', and it moved four filings out of D1a entirely (D1d, D1e, D1g in the
workboard, plus the leak below). The check-rejects are D1f and the `newtype` / `match` boundaries.

The one live defect ON the consumption path is the ARGUMENT boundary, and its sign is the opposite
of D1a's: where D1a was a value that failed to become an atom, this is a value that became one it
should not have. All three argument spines read the pending seeds through `expCtxHere()`, which
SNAPSHOTS the ambient, so every atom-typed destination holding a call — including `"s" + f(a)`,
which reaches the call through `emitAtomToStr`'s own seed — pushed its atom context down into `f`'s
arguments. **216-cell spine grid (5 call spines × 5 argument kinds × 8 destinations, plus a `K | null`
parameter's null/member arguments): 137 invalid-wasm → 0.**

It took two commits because the two halves are opposite directions of one invariant — *an argument's
rep belongs to the callee's parameter*:

- **Do not inherit.** Clear `pendingLitUnion` / `pendingNulLitUnion` for the arg spine in all three
  call emitters; the positions that really want an atom re-seed from the CALLEE (`cParamLitUnion`,
  `cloCallParamLitUnion`, `cpLit`). 105 cells.
- **Do widen.** A `K` ATOM argument into a `string` parameter existed on the DIRECT spine only
  (`cParamStr`); the value and captured spines pushed the raw i32 into a `(ref $array)` slot. 32
  cells. Its second half is the RESERVATION SCAN — `callWidensAtomToStr` resolved a direct callee
  only, so the handler alone traded a type mismatch for `unknown local N` on 3 of the 32. Scan and
  handler now read the SAME `$fnsig` parameter byte, which is what keeps them from disagreeing.

*Method note: **the confound test is the cheap one and it should come first.** Four of the five
invalid-wasm families this grid turned up were still invalid with the guard deleted, and two of them
(`ret`, `nested`) were 49 of the 54 baseline cells — a grid that had stopped at "D1a is 54 cells"
would have reported a population five times its real size and then "fixed" defects that were never
in the row.*


---

## D6 (function-type union arms) is MEASURED — the population is 72, and the filed mechanism is refuted by the disassembly

The "still open" table above files this as **4 cells** (*"3 RUN-WRONG + 1 EMIT-REJECT"*) with the
note *"the closure fat-pointer's arm tag is a separate table from the value-atom tags this slice
touched"*. Re-gridded from scratch on master @`dfd93627` with a seed refreshed from that source:
**380 cells, 77 RUN-WRONG, 19 EMIT-REJECT, 2 INVALID-WASM, 282 RUN-OK**, plus a **36-cell control
grid** that decides which of the non-RUN-OK cells are about functions at all. **72 of the 77 wrong
answers are this defect**; the controls move the other 5, and both loud classes, out of the family.

Both halves of the filing are wrong in the direction this document keeps recording. The population
is **18x** the filed number, and the arm tag is **not a separate table** — it is slot 11 of the same
`scalarTagOfKind` band every other value atom uses.

### The defect, in one sentence

**A union may carry any number of function-typed arms, and they all share ONE box tag**, so `x is F`
answers TRUE for a value built through *any* function arm — including a closure whose signature the
checker refuses to assign to `F` one line away.

```vl
type F = (i32) => i32
type G = (string) => i32
function probe(x: F | G) {
  if x is F { const y: F = x }   // TAKEN for a G value. `vl check` rc 0, `vl build` rc 0
  0
}
probe((s: string) => 7)
```

The inverted control is one line and it is the whole argument: `function m(g: G) { const y: F = g }`
is `vl check` rc 1 — *`cannot assign (string) -> i32 to 'y' of type (i32) -> i32`*. The union + `is`
route manufactures exactly the assignment the checker refuses, which is **ROOT B**, live, for a
population ROOT B's own sweep never reached.

### The population — measured on master's seed

**Two function-typed arms: 158 cells, 72 RUN-WRONG, 86 masked.** The 86 are the constructions that
happen to agree; every one of them has an inverted twin in the same row that is RUN-WRONG, so by this
family's standing rule not one of them is a cell the shape decides correctly. `is F` over a union
with a second function arm is a **constant TRUE**, in both directions (`is G` over the same union is
also constant TRUE — its own 7 cells) and for every arm count.

| union | tested | fn build | other build | cells |
|---|---|---|---|---|
| `F \| G` (param type differs) | `F` | ok | **WRONG** | 44 |
| `F \| G` (param type differs) | `G` | **WRONG** | ok | 14 |
| `F \| H` (**arity** differs) | `F` | ok | **WRONG** | 22 |
| `F \| J` (**return** differs) | `F` | ok | **WRONG** | 22 |
| `F \| K0` (**zero-arity**) | `F` | ok | **WRONG** | 14 |
| `F \| G \| string` | `F` | ok | **WRONG** (string arm ok) | 21 |
| `F \| G \| null` | `F` | ok | **WRONG** (null arm ok) | 21 |

**Every partner arm that reps differently is CORRECT — 161 of 166 cells.** `F | string`, `F | i32`,
`F | i64`, `F | f64`, `F | boolean`, `F | i32[]`, `F | string[]`, `F | {a: i32}`, `F | null`,
`F | string | i32`: RUN-OK on both constructions, every receiver, both spellings. The 5 that are not
are the two optional-chain cells and the two bound-map-read cells the controls move out, plus
`F | {[string]: i32}`'s known loud *"a map value is not a supported union member"*.

**Closure ARRAYS discriminate, and that is the finding that identifies the mechanism.** `F[] | G[]`
answers correctly at the local / param / call receivers — the element signature reaches the tag even
though a bare closure arm's cannot.

### Two axes that do NOT multiply this population, and one that does not exist

- **Receiver: FLAT across all 11 forms** — local `const`, `let`, parameter, module global, struct
  field, nested field `s.g.f`, array element, direct map read, bound map read, call result, optional
  chain. Every one of them grades identically for every shape. This is the opposite of D1b, where the
  receiver axis turned 1 filed cell into 16, and the reason is structural: D1b's receiver axis existed
  because the litunion MEMBERSHIP arm carries a receiver bound (`unionEqOperandOk`). A function tested
  type reaches no membership arm at all — `tyLitMemberTexts` and `numLitUnionBaseName` are both empty
  for a `TyFunc` — so every receiver falls to the one tag compare and gets the same wrong constant.
- **Spelling: FLAT.** The alias `type F = (i32) => i32` and the inline `(i32) => i32` grade identically
  in all 66 paired cells. The one-member-`TyUnion` wrapper an arrow-bodied alias carries
  (`tyDenotesFunc`'s subject) does not reach this answer.
- **No `vl check` arm.** Not one cell in the whole 380 is CHECK-REJECT. The checker accepts every
  union with two function arms and every `is` over one.

### The mechanism, from the disassembly

`vl build` + `wasm-tools print` on `F | G` at a parameter receiver, the value built through `G`:

```wat
(type (;0;) (struct (field i32) (field anyref)))          ;; the union box
(type (;2;) (struct (field structref) (field i32)))       ;; the closure fat pointer: {env, table idx}

;; the G closure, boxed:                    ;; `x is F`:
ref.null struct                             local.get 1
i32.const 11        ;; <- the box TAG       struct.get 0 0
ref.null struct                             i32.const 11   ;; <- the SAME tag
i32.const 5         ;; the table index      i32.eq
struct.new 2
struct.new 0
```

Both sides are `11`, and the source says why in one line: `unMemAtomKind`
(`emit_classify.vl`) answers **`if t is TyFunc { return 11 }`** for every function type whatever its
signature, and `scalarTagOfKind(k) = uVariants.length + k` (`emit_rep.vl`) is the tag. That is the
value-atom band — the same table `string` (kind 2), `i32` (kind 0) and `null` (kind 6) take, which is
why every non-function partner arm above is correct. **There is no separate closure table, and the
fat pointer carries no signature discriminant**: it is `{env, table index}`, two fields, and the
`$fnsig` interning that knows the signature is a compile-time key for `call_indirect`, not a stored
value.

**The one table that IS separate is the reflist band, and it works.** For `F[] | G[]` the same
disassembly shows tag **13** vs tag **15** — `refArrSlotTag(slot) = uVariants.length + 13 + slot*2`,
and *"a distinct element type interns a distinct reflist slot"*. So the emitter can and does
distinguish two closure signatures when they arrive as ELEMENT types; the information exists at emit
time and only the bare-arm tag throws it away.

### What the wrong answer costs at run time — and where it stops being loud

Calling the mis-narrowed value **traps**: `wasm trap: indirect call type mismatch`, because
`call_indirect` re-checks the signature the table slot actually holds. That is the loud half.

The silent half is everything short of a call, and it is unbounded:

```vl
if x is F {          // x is a (string) => i32
  const y: F = x     // prints nothing, no diagnostic
  const arr: F[] = [y]
  print(arr.length)  // 1
}
```

`vl check` rc 0, `vl run` rc 0, output `1`. The wrong-signature closure is now inside an `F[]`, and
the fault surfaces at whatever later call reads it out — or never.

### What is NOT D6 — each decided by a control, not by inspection

The 36-cell control grid re-runs the two receiver forms that failed for a function union against nine
**non-function** unions. It moves three findings out of this family:

| symptom | function cells | the control that moves it out |
|---|---:|---|
| `s?.f is T` over an OPTIONAL CHAIN answers a constant FALSE | 5 | `s?.f is string` over `{f: string \| null}` with `f = "hi"` prints **no**. Same for `i32[] \| null` and `string[] \| i32[]`. `i32 \| null`, `f64 \| null`, `string \| i32`, `i32[] \| string` are fine — the failing column is the NICHE nullable and the ref-element array, not the function |
| a bound map read `const r = mp[k]` | 2 INVALID-WASM | **the `is` is not involved.** Deleting the guard entirely still emits invalid wasm: `{[string]: F \| null}` with only `null` ever stored mints a duplicate array type (`expected (ref null $type), found (ref null $type)`, two distinct indices printing the same name). A map REP hole. Its non-function twins are EMIT-REJECT (`i32[] \| null`, `string[] \| i32[]`) and RUN-WRONG (`string \| null`) |
| `F \| F2`, two aliases with the SAME signature | 12 EMIT-REJECT + 2 RUN-WRONG | `type A = i32; type B = i32; x: A \| B` → `x is A` prints **notA**, silently. VL is structurally typed, so both unions collapse to one member and `is` should be trivially TRUE. The degenerate one-member union is a general shape, and the FUNCTION spelling is the loud one (*``is` test but no union type declared`*) while the scalar spelling is the silent one |

`F[] | G[]` at a struct-field / array-element / map-value receiver is 6 EMIT-REJECT, and the
`string[] | i32[]` control rejects at the same receivers — the general ref-array-arm limit, not this
family.

### Did this cycle's sibling work move any cell? No, and the disassembly is why

The two mechanisms to check were named up front: #1340's membership ladder in `emitIs`, and #1380's
widening of `unionEqOperandOk` from *"is Ident"* to *"is a place"*. **Function arms share neither**,
and the emitted bytes say so rather than the reasoning: the lowering for `x is F` is the bare
`struct.get 0 0 / i32.const 11 / i32.eq`, so no membership arm fired. Both arms are gated on a tested
type with literal MEMBERS (`tyLitMemberTexts`, `tyNumLitMemberTexts`), and a `TyFunc` has none — it
is not that the arms decline this shape, it is that the shape is not a candidate. That is also the
structural reason the receiver axis is flat here and was 16 cells wide for D1b: `unionEqOperandOk`
only ever bounded the membership arms.

### Why this is filed rather than fixed

Two answers exist and neither is small:

- **The real lowering** is membership over the fat pointer's TABLE INDEX — `idx == s0 || idx == s1 ||
  …` over the slots whose function carries `F`'s signature, which is #1340's shape one layer out. The
  emitter has the signature (the reflist band proves it) but the elem segment is not final when a body
  is emitted, so this needs a deferred patch, not an arm.
- **The rep answer** is a third fat-pointer field, or a `$fnsig` id in the box tag. That is a closure
  struct layout change, which the agent playbook rules out by name.

The **loud floor** — reject `is <function type>` when the union carries two function arms, the shape
`unionStrArmCount > 1` already ships for the string side — is the cheap option and its blast radius is
measured: **zero corpus files**. No file under `tests/cases` declares a union with two function-typed
arms (checked by scanning every arrow-bearing type alias and every parenthesised union arm; the
matches are all arrow types whose RETURN is a union). It is left unbuilt here because a census was the
ask and because it costs the 86 masked-correct cells their compile, which is a reject-parity decision
rather than a ride-along.

Pinned in the meantime by `tests/cases/closures/is-function-arm-partner-discrimination.vl` — the 14
rows of the CORRECT half, one per partner arm plus the two closure-array rows, so a future fix cannot
buy the two-fn-arm case by breaking the arms that already discriminate.

*Method note this census adds: **when a filing says "a separate table", read which table the tag comes
from before believing either half of that sentence.** The note was right that a mechanism it had not
probed was involved and wrong about which — the closure arm is in the SAME band as every other atom,
and the genuinely separate table (the reflist band) is the one place the defect does NOT reproduce. It
is the CORRECT column that named the mechanism, exactly as D1b's `K | i32` column did: `F[] | G[]`
answering right is what proves the emitter holds the signature and that only the bare arm's tag
discards it.*


---

## D10 is CLOSED — and the `| null` in the filing was a coincidence of the witness

D10 was filed as *"a bound map read of a NICHE-NULLABLE value emits INVALID WASM"*, witnessed by
`{[string]: F | null}` storing only `null`. Re-gridded on master's seed: **12 value types × nullable /
plain × 3 read forms × 3 store states × called / uncalled = 300 cells.**

**Three of the 300 are INVALID-WASM, and one of them has no `| null` and no store anywhere in it.**

| cell | |
|---|---|
| `fn` · `F \| null` · bound read · null-only store · uncalled | INVALID-WASM |
| `fn` · `F \| null` · bound read · **empty map** · uncalled | INVALID-WASM |
| `fn` · **`F` (no `\| null`)** · bound read · **empty map** · uncalled | INVALID-WASM |

Every other value type is clean at every cell: `struct`, `string`, `boolean`, `litunion` are 25/25
RUN; `i32` / `f64` / `i64` fail only at the pre-existing *"bare null needs a struct-typed context"*;
`i32[]` / `string[]` at *"unsupported map value type"*; `Set` is 25/25 CHECK-REJECT. **The nullability
axis moves nothing** — it is the value being a CLOSURE that does, and the null-only store is simply
one way to write a program that never constructs one.

### The real trigger, from an 18-cell position grid

`{[string]: F}` at a **local / module-global / struct-field / parameter** receiver, with an **i32 key**,
and in the **inline `(i32) => i32` spelling**: all six INVALID-WASM. The `call` twin of each is the
LOUD sibling — *"function-value call arity has no interned signature"*.

The three value shapes that carry a closure DEEPER than the value cell are all CLEAN:
`{[string]: F[]}`, `{[string]: {f: F}}`, `{[string]: {[string]: F}}`. So the population is exactly
*"the map's VALUE CELL is a closure or nullable closure, and the program constructs no closure"*.

### The mechanism, from the disassembly

The module carries no closure fat-pointer struct at all — `fnValUsed` is false — while the bound
local for the map read is declared `(ref null 7)`, the MAP struct's index. `wasm-tools print` also
shows the duplicate the filing named: types 2 and 4 are both `(array (mut (ref null 0)))`, two
distinct rec-group indices printing one name, which is why the validator's message reads
`expected (ref null $type), found (ref null $type)`.

`collectFnValUse`'s `TypeRef` scan flips `fnValUsed` for a function-type annotation, a closure ARRAY,
a nullable closure, a shape with a closure FIELD, and each of those as a union ARM. **There was no arm
for a map VALUE.** And the `$fnsig` rides the same gate from the other side: `collectCloSigs` already
descends `TyMap.mVal` in its arena walk (`collectTyReachCloSigs`) and is itself gated on `fnValUsed`,
so one flip closes the loud call cells as well as the invalid-wasm ones.

`mapValIsClosure` asks the map-value cell the two predicates `shapeHasCloField`'s union-arm loop
already asks of a struct FIELD cell, read at both the top-level annotation and the union-arm position.
A closure-ARRAY or closure-FIELD map value is deliberately not claimed — those reach the machinery
through their own branches, and claiming them would flip `fnValUsed` for programs that do not need it.

**300 cells, 6 UP, 0 DOWN. 18-cell position grid, 8 UP (6 INVALID-WASM + 2 EMIT-REJECT), 0 DOWN, 10
controls unchanged.** Pinned by `tests/cases/maps/closure-value-no-function-value.vl`, which is
lambda-free by construction — the existing `maps/bare-read-nullable-value.vl` stores a real lambda in
its closure-valued map, so a fix that only worked when a closure exists cannot pass both files.

*Method note: **the axis a witness varies is not the axis a defect lives on.** The filing's witness
varied nullability and store contents, so both entered the description; the 300-cell grid moved
neither. What it did move was the axis the witness held constant — the VALUE TYPE — and the plain,
never-stored `{[string]: F}` cell that fell out of it is a stricter repro than the filed one.*


---

## D11 is CLOSED — the degenerate UNION was the witness, the defect is ALIAS TRANSPARENCY

D11 was filed as *"a degenerate one-member union (two aliases with the same structure) breaks `is`"*.
The brief's question — does the structural-collapse rule make the correct answer TRUE rather than a
reject? — is answered by the existing pins and the answer is **TRUE**:
`types/struct-union-same-shape.vl` states it in its own header (*"two `type` aliases with the SAME
shape are therefore the same variant — a `B` value genuinely IS an `A`"*), and the STRUCT and
LITERAL-UNION spellings already answer it that way. So `x is A` over an `A | B` of twin aliases is
soundly always true, and both a wrong answer and a reject are wrong.

### The grid, and the control that relocated the defect

**10 base types × 2 directions × 6 receivers = 120 cells, plus 8 controls.** On master:

| base | 12 cells | |
|---|---|---|
| `i32` · `i64` · `f64` · `boolean` · `string` · `i32[]` · `{[string]: i32}` | **84 silent `no`** | wrong |
| `(i32) => i32` | 12 EMIT-REJECT | loud (D6's `` `is` test but no union type declared ``) |
| `{ v: i32 }` | 10 correct + 2 EMIT-REJECT at a call-result receiver | the pin's own shape |
| `"a" \| "b"` | 12 correct | #1345's membership arms |

**The receiver axis is FLAT** (param / local `const` / `let` / module global / struct field / call
result all grade alike), which is what says the receiver is not the variable.

The control that moved the defect off the union is one line: `type A = i32; function p(x: A) { if x
is A … }` — **no union anywhere** — printed `no`. So did `x: i32` tested `is A`. And `x: A` tested
`is i32` printed `yes`, as did `x: i32 | i32`. **The union is not in the mechanism at all.**

### The mechanism

`monoStaticIsResult` decides a non-union `is` by comparing `monoArgTyName`'s receiver name — a
CANONICAL emit name, because canon rewrites every annotation before codegen — against
`IsExpr.isVariant`, the **RAW source spelling**. `"i32" == "A"` is false, `repIsRowMatchTy` answers
-1 for a pair that names no struct row, and the function returns the constant 0. A transparent alias
never matches the type it denotes.

The fix compares against `tyToEmitName` of the type the checker already banked at the node
(`isVarTyIxOf` — the same bank `isArmTagOfTy` and the narrow push read), so no spelling is re-parsed
and a NAMED struct renders as its own name, leaving the struct-row compare below untouched.

**And it has to DECLINE a tested type carrying a literal**, which is measured rather than reasoned:
`literal-unions/mixed-union-litunion-arm-is-membership.vl` went red on the first build. A literal
union's `RC_ROOT` render SOFTENS to its base (`ctxKeepsLitUnion` is false there), so `("pp" | "qq")`
and `string` render alike while only one of them holds `"zz"` — render-equality answers about the
BASE, not about the type. `tyRenderSoftensLits` is that decline, and the membership lowerings that
own those shapes all run above this fold.

**128 cells, 77 UP, 0 DOWN.** Plus 11 trivial-`is` probes (4 UP) and 9 newtype / generic controls
(2 UP). Pinned by `tests/cases/types/is-alias-transparent-degenerate-union.vl`.

### What the controls hold shut

Every cross-type NEWTYPE cell is CHECK-REJECT before and after — `N | i32` at the declaration
(#1344), and `x: i32` tested `is N` / `x: N` tested `is i32` at the checker's `is` gate (#1343). The
brand cells this moves are the two that are trivially true (`x: N` tested `is N`), which is the same
alias-transparency answer one erasure down. A genuinely DISTINCT pair (`type A = i32; type B =
string`) still discriminates by value, and a litunion alias over a plain `string` receiver still
answers its filed constant FALSE rather than folding TRUE.

The pairing worth keeping is the generic one: `g<T>(v: T) { v is A }` and `g<T>(v: T) { v is i32 }`
are the SAME program in two spellings, and master decided them differently (`no|no` vs `yes|no`).
They agree now, and both spellings are in the pin.

### What is still open, measured on the same grid

- **The map twin** (`type A = {[string]: i32}` twice) is still `no` at 10 of its 12 cells — only the
  call-result receiver moved. `monoArgTyName` names no map type, so `sk` is the `"i32"` catch-all and
  the compare is against the wrong name rather than against a raw spelling. Same family as D9 below.
- **The function twin** is still 12 EMIT-REJECT. That is D6's loud arm and it wants D6's decision.
- **A struct twin at a CALL-RESULT receiver** is 2 EMIT-REJECT, unchanged.

*Method note: **the pins are the spec, and reading them first was the whole of the semantics question.**
The filing offered "TRUE or reject" as an open choice; `types/struct-union-same-shape.vl` had already
answered it, in prose, for the one spelling that worked. The remaining work was to find out why six
other spellings disagreed with it — and the answer was in a control with no union in it.*


---

## D9 is FILED — the mechanism in the workboard is WRONG, and it is not #1380's remainder either

D9: `s?.f is T` over an optional chain answers a constant FALSE where the field is a niche nullable
or a ref-element array. Both of the mechanisms it was filed against are refuted by measurement.

### The grid

**13 field types × 2 builds × 4 receiver forms = 104 cells**, graded against a stated `want` per cell.

| field type | `s?.f` | `s.f` (control) | `o?.g?.f` | `const r = s?.f` |
|---|---|---|---|---|
| `string \| null` | **WRONG** | ok | **WRONG** | EMIT-REJECT |
| `i32[] \| null` | **WRONG** | ok | **WRONG** | EMIT-REJECT |
| `F \| null` | **WRONG** | ok | **WRONG** | EMIT-REJECT |
| `K \| null` (litunion) | **WRONG** | ok | **WRONG** | EMIT-REJECT |
| `Q \| null` (struct) | **WRONG** | ok | **WRONG** | EMIT-REJECT |
| `string[] \| i32[]` | **WRONG** | EMIT-REJECT | **WRONG** | EMIT-REJECT |
| `i32 \| null` · `i64 \| null` · `f64 \| null` · `string \| i32` · `i32[] \| string` | ok | ok | ok | EMIT-REJECT |
| `boolean \| null` · `{[string]: i32} \| null` | WRONG | **WRONG** | WRONG | EMIT-REJECT |

**D9 proper is 12 cells** — the six field shapes whose PLAIN-MEMBER control is correct (or loudly
rejects), at the two chain depths. **The chain-depth axis is flat.** The last row is NOT D9: those two
field types are wrong at the plain member too, so the optional chain is not their variable. The
`const r = s?.f` column is 26/26 a pre-existing loud limit with no `is` in it.

### The CORRECT column is what names the mechanism

`i32 | null`, `i64 | null`, `f64 | null`, `string | i32`, `i32[] | string` are the field types whose
rep is a real union BOX, and every one of them discriminates through a chain at every depth. A boxed
field makes `exprUnion` true for the chain receiver, so `monoArgTyName` returns `""` and
`monoStaticIsResult` declines (-1), handing the guard to the box-tag compare that decides it exactly.

**A niche field reaches no such classifier, so `monoArgTyName` falls all the way to its final line —
a bare `"i32"` CATCH-ALL DEFAULT** — and `monoStaticIsResult` then compares `"i32"` against `string` /
`F` / `K` and returns the constant 0. `wasm-tools print` shows the whole guard as `i32.const 0`.

That default is not a bug on its own: it is how `v is i32` answers TRUE in a generic instance pinned
to i32. The bug is a classifier that cannot say *"I could not name this"* being trusted by a fold that
needs exactly that answer.

**So the workboard's mechanism is wrong.** It names `emitIs`'s `OptMember` arm keying on
`sFieldTypeAt(si, fi) == 16`. That code is in `isStrTagUnionNameOf`, which supplies a NAME for the
box-tag soundness floor and emits nothing; the guard never reaches it. **And it is not #1380's
remainder**: #1380 widened `unionEqOperandOk`, which gates the literal-union MEMBERSHIP arms, and a
niche-nullable tested type reaches no membership arm at all — the same structural reason D6's receiver
axis is flat.

### Why it is filed rather than fixed, and what the blocker actually is

The obvious lowering is the one the shape already has a name for: `s?.f is T` where the field is
`T | null` is exactly `s?.f != null`. **That sibling is itself wrong for four of the six shapes**, and
that is the measurement that decides this item:

| control | result |
|---|---|
| `{f: Q \| null}` (nullable STRUCT), `s?.f != null` | `yes / no / no` — **correct** |
| `{f: string \| null}`, `s?.f != null` with `f = null` | **`yes`** — wrong, it answers only about `s` |
| `{f: K \| null}` (litunion), `s?.f != null` with `f = null` | **`yes`** — wrong, same way |
| `{f: string \| null}`, plain `s.f != null` with `f = null` | `no` — correct, so it is the CHAIN read |

So there is no working sibling lowering to route `is` into: the optional-chain READ of a
niche-nullable leaf field is right for the struct-ref niche and wrong for the string and atom niches,
and the `is` question sits downstream of it. Fixing D9 means fixing that read — a rep/lowering
decision across five niche kinds, not a patch to the fold.

The cheap alternative is the LOUD FLOOR — decline the fold for an optional-chain receiver, so the 8
silent cells become emit rejects. Its corpus blast radius is **zero files** (`types/optional-chain.vl`
is the only corpus file with an `is` over a chain, and its field is the boxed `string | i32`, which
already declines). It is left unbuilt for the same reason D6's floor is: it costs the 7 MASKED cells
their compile — each is a chain cell whose value happens to be `null`, so the constant FALSE is
accidentally right — and that is a reject-parity decision rather than a ride-along.

### Two adjacent defects the grid found, each with its own control

- **A stored `null` answers TRUE for the non-null arm at the PLAIN member.** `{f: string | null}` with
  `f = null`: `s.f is string` prints `yes`, while `s.f != null` on the identical program prints `no`.
  Same for `i32[] | null`. Fails OPEN, `vl check` rc 0 — a different and worse class than D9's
  fail-closed cells, and it has nothing to do with optional chains.
- **`boolean | null` and `{[string]: i32} | null` FIELDS answer FALSE for their own non-null arm at
  every receiver**, plain member included. Their controls (`i32 | null` at the same receivers) are
  correct, so this is the field type and not the receiver.

Pinned in the meantime by `tests/cases/types/is-optional-chain-boxed-field-discrimination.vl` — the
boxed column at both chain depths plus the nullable-struct chain read that IS correct today, so a
future fix cannot buy the niche cells by breaking the arms that already work.

*Method note this filing adds: **before believing a filed mechanism, check that the code it names is
on the emitting path at all.** `isStrTagUnionNameOf`'s `== 16` gate reads exactly like the cause and
supplies only a name to a floor the guard never reaches; the disassembly (`i32.const 0`, no receiver
evaluated) says the decision was made a hundred lines earlier by a function whose name has nothing to
do with optional chains. And the second half: **when a fix would reuse a sibling lowering, run the
sibling first.** Four of six shapes' `?. != null` is wrong, which turned a one-arm fix into a rep
question in three commands.*
