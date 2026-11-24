# IR-N3: `global read coercion`, part 5 — a bundle holder global over a map read (2026-11-24, lane IR-N3)

A module binding holding a bundle record — one closure per signature (D15144) — read out of a map
(`const x = m["a"]`) holds the record beside `null`: its cell is `record | null` (`globalHolderTy`
names the record), while the checker types the read at one closure member's `F | null`. Legacy reads
the cell as it stores it in both of the IR's misses here; the local spelling builds both already.

## The null test (`nulTestOperand`)

On the `nullRef` arm, such a global is read as its cell stores it, and noted held whole as its record
(`irGlobalHeld`), as `globalRep` notes a holder's cell; legacy writes `ref.as_non_null`, `ref.is_null`.

## A call through it (`holderRecordOf`)

A holder call (`holderCallRhs`) and a typed holder binding (`holderPickLet`) read the record a pick
reads a member of. Such a global is read narrowed to that record, its recover legacy's
`ref.as_non_null` (`globalReadRecovers`), then `RBundlePick` picks the member as before.

## Grading (tests/cases, fixpoint seeds)

| program | before | after |
|---|---|---|
| `closures/bundle-records-apart-only-in-their-closures-types` start | `global read coercion` | `map get rep` |
| `closures/bundle-record-held-in-a-map-value` start | `global read coercion` | `global read coercion`, at `const v = x` |

On master 1db11290b (mode 4): starts naming `global read coercion` 5 → 4 (one of them now also
`indirect call`), `start uncovered map get rep` 11 → 12; the corpus is unchanged.

FREE: an un-annotated binding of the narrowed holder (`const v = x`), whose local spelling misses too
(`open local type`) — a binding capability, not a global read.

## Legacy tails the IR calls

None new: `globalStoredRead`, the `nullRef` null test and `RBundlePick`.

## Position sweep (Q58)

The holder's null test and a call through it, its result delivered in twelve positions under
`VL_IR_SHADOW=6`: the null test itself and as an `if` condition, direct call argument (scalar and
union parameter), nested call argument, string-concat operand, interpolation hole, `const`
initializer, `??` operand, record-literal field, `return`, `if` arm value. Ten: every covered
function matched under the candidate (the base misses each at `global read coercion`), output
identical, claimless identical. Two — `return` and the `if` arm, which read the holder inside a
function — are a claimless DIFF on both seeds (exit 70 vs 1): D17094 as corrected (a claimed start
skipping legacy's loud refusal), present on master, base and candidate alike.

## Measured (fixpoint seeds on both sides)

Full proof on base master 84170c683: byte A/B 20,529 programs 0 moved; `ir-identity --cases`,
`--claimless`, `--names` differ 0 / differ 0 / self-compile identical; mode 3 self byte-identical;
corpus shadow 46,806 matched, 0 order rows; self-compile guest fuel 125,340,794,097 →
125,340,843,255 (+0.00%). After the held note's bound test, the row's print without `std:fmt`, and
a mechanical merge of master 1db11290b: `gate.sh --fast` passed, `ir-identity --cases` differ 0,
byte A/B 20,539 programs 0 moved.
