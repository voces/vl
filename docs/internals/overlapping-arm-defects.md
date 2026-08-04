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

**A precise root-cause partition of all 64 has not been done** and is worth its own pass before any
fix is scheduled — the count above is by keyword, which left 39 unclassified.

## Method notes worth keeping

- **The adversarial verify stage earned its place**: 7 suspects were refuted on re-run, several
  because the prober's "expected" answer was wrong about VL's actual rule rather than because the
  compiler was right.
- **Every probe carried an inverted control**, and the confirmations cite theirs — e.g. the
  laundering cells each pair with the direct call that IS rejected. A cell whose control does not
  move is unmeasured, not clean.
- **A filing's stated mechanism can be wrong for months while its symptom is real.** The tag-band
  framing survived because nobody built it; #1340 built it and it was 2 cells up, 3 down.

