# Step 7 slot layer, family B: the two disagreeing `variantIndexOf` sites switched, the unreached rungs deleted, 2026-11-11

This follows `2026-11-11-step7-famb-variant-index-graded.md` (#7269). That note held two sites
back because the probe found their name and type answers disagree. It also left two rungs that no
program reaches. The orchestrator ruled to switch the first pair and delete the second, in one PR.
Base is master `3155fd79` (#7274), whose fixpoint seed is 6,619,938 bytes.

## The switches

| site | before | after | disagreed in |
| --- | --- | --- | --- |
| `arrLitElemHintTy`, `arrLitElemNameTpl` (`emit_classify`) | `variantIndexOf(arrLitObjElemBoxVariant(arrIx))`, the name's first row | `arrLitObjElemBoxRow(arrIx)`, the arm row the lead literal is built at | 3 programs |
| `cbRetVariantIdx` (`emit_field_codes`) | the inferred return's spelling, then its type; the struct-collapse gate on "the spelling names an arm" | the inferred return type's variant row; the gate on "the type is a declared arm member" (`tyIsVariantMember`) | 60 programs, all at the gate |

On #7269's base, a scratch compiler with both switches built all 63 disagreeing programs to
byte-identical modules. Every other program reaches the sites with the two answers equal.

**The ARM2 finding.** `arrLitObjElemBoxVariant` answered `uVariants[vr]`, and its callers turned
that name back into a row with `variantIndexOf`. That gives the **first** row registered under the
name. When an arm is a member of two unions, the first row belongs to the other union. Take
`type A = {a: i32}` as an arm of both `A | B` and `A | i32`. A literal of `(A | i32)[]` builds at
`A | i32`'s row for `A`. The round trip answers `A | B`'s row, and the two callers then read the
element union as `A | B`. The three witnesses run today because every union shares one box, so the
union row decides only what a reader believes (D3092):

- `tests/cases/types/union-list-alias.vl`;
- `tests/cases/unions/is-inline-arm-lone-literal-field.vl` (`{tag: "end"}`);
- `tests/cases/unions/shared-nullable-scalar-field-read.vl`.

This is a latent wrong-row hazard. Any reader of that union row that does more than name the box
would take the other union's arm list. The callers now read the row the literal is built at.

**The MIX gate.** In the 60 programs, a callback such as `(y) => if y is Circle { y } else { d }`
has the inferred-return spelling `{r: i32}`, which names no arm, while its type is `Circle`'s, a
declared arm. The gate's contract is that a return that *is* a declared arm always collapses to
the variant. The type says so directly. The spelling said so only when it happened to be the arm's name.

## The deletions

- **`exprVariantIndex`'s pre-mono variant rung.** 140 programs call it before monomorphization,
  and none passes `nodeRepIs(variant)`. The rung read the type's first name. This PR made a
  pre-mono variant receiver an internal emit error. After #7273, mono's pin naming asks before
  an instance union's row exists, so #7292 made the rung answer -1 instead.
- **`mfRecordElemRowName`.** No program reaches it (0 of 23,911). It and its one rung in the
  `.map` result-slot ladder are deleted.

- **`monoArgTyNameProjected`'s nullable-receiver rung** (`emit_mono`, a follow-up PR), the
  type's-first-name rung #7279 found unreached. A probe at the record-field arm fired in 4 programs and on a
  hand-written un-annotated nullable receiver. In every one the receiver's pin named its row, so the
  rung below never ran. It is deleted.

`variantIndexOf` falls from 54 to 48 grep sites on this base, and `inferRetNameByNode` has one reader fewer.

## Step-7 remainder

- `retStructRowIndex`'s name rung (#7279: 109 programs). The newtype brands `I32View`/`F32View` and
  same-shape declarations carry declaration identity that the type does not. It waits on struct
  rows keyed by `(type, declaration)`.

## Proof

- Refresh ×2 is a fixpoint at 6,619,677 bytes (−261). Local sweep, fixpoint seeds on both sides: 23,916 same, 0 movers.
- `regress.vl`, `lint-self`, `cases_wasm`, seed size, late demands, plumb-shape cost, ladder sets,
  the dead-export budget and the memo-generation and live-sites tests pass.
