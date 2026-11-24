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

## Grading (tests/cases, mode 1, fixpoint seeds on master 4b8ecaed)

| program | before | after |
|---|---|---|
| `closures/bundle-records-apart-only-in-their-closures-types` start | `global read coercion` | `map get rep` |
| `closures/bundle-record-held-in-a-map-value` start | `global read coercion` | `global read coercion`, at `const v = x` |

`start uncovered global read coercion` 7 → 6, `start uncovered map get rep` 11 → 12. An un-annotated
binding of the narrowed holder (`const v = x`) is left: its local spelling misses too (`open local
type`), a binding capability, not a global read. Reading such a map from a function is invalid wasm
under legacy (D17094, filed by this lane's position sweep).

## Legacy tails the IR calls

None new: `globalStoredRead`, the `nullRef` null test and `RBundlePick`.
