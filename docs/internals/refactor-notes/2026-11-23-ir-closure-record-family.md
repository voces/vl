# IR: a closure at a record field, and a returned record on its result's heap, retag, 2026-11-23

Lane IR-N6, the closure-holding record family. IR-N5 handed over 29 `object field coercion` rows
whose value and field kid are both closures.

## The family, by ablation

An instrumented scratch seed (never pushed) printed the closure pair at objLit's field miss.
After #9632's openness retag was applied at the field, 4 cells closed and 24 were left. All 24 are
closure against closure with a closed-signature mismatch: a result `str > i32`, `bool > str`, or
a parameter, arity or void difference.

Witness: `closures/twin-fieldset-closure-field-string-vs-bool-result.vl`. Twin fieldsets
`{f: (…) => string}` and `{f: (…) => boolean}` share one struct heap. The IR's row rep for that
heap carries one twin's closure kid, while the value is the other twin's closure.

## The changes

1. **Openness at a record field.** `objLitAt` retags a field value whose closure rep differs from
   the kid only in openness (`holeRetagNoted`, #9632's helper).
2. **A noted closure-field retag.** Where legacy writes the field plainly, the builder notes the
   retag node in `IrFn.irCloFieldRetag` (`irCloFieldRetagNote`). The conditions are all checked in
   the builder:
   - `fieldPlainWhy` is `""`, with no explicit-null `own` or `typed` path;
   - the value and the kid are both `RClosure`;
   - `exprPrePathWhy` is `""`;
   - the row's heap is noted (`recHeapNoted`).

   The verifier's `cloFieldRetag` admits closure into closure across a closed signature only on
   a noted node. The keyed self-tests are `retag-closures-of-differing-arity`, still refused (rule
   2), and `retag-closures-of-differing-arity-noted`, admitted (rule 0). The bytes are identical
   because legacy writes the one closure struct whatever signature either side names.
3. **A returned record on its result's noted heap.** The return path asks `recRetagNoted`: note
   both reps' heaps, then IR-M1's `recRetagAt`, which checks the same heap or a declared subtype
   and lower-alike fields. That takes 11 returns of same-heap records whose closure field differs,
   which change 2 had uncovered. The argument and global-init record retags also note both heaps
   first now.

## Left out, named

- 11 `argument coercion` and `global initializer coercion` start cells from IR-M1. Their cell
  record rep has no heap: an open-kid record type has no struct row, so `recordHeapOfTy` is -1,
  while legacy stores at the binding's storage row. They stay with IR-M1's start global-init lane.
- **D17060**, filed here. `const c = 1 > 0; print([if c { 1 } else { 2 }][0])` mismatches the
  armed shadow's start span rows on base and head alike. Change 2 uncovered one more start body of
  that shape, `closures/if-arm-closed-record-beside-hole-fn-record.vl`, so `ir-shadow-cases-baseline`
  goes from 1 to 2 `mismatch start spans: read index`, on the coordinator's ruling (a). That start
  is claimed, and its module is byte-identical to the claimless compiler's. IR-N4 owns the
  span-compare fix.

## Readings (base: a CD1 fixpoint, a4de4b2d; fixpoint seeds on both sides)

| class (tests/cases) | base (any / alone) | this change |
| --- | ---: | ---: |
| `object field coercion` | 38 / 37 | 10 / 9 |
| `return coercion` | 31 / 29 | 31 / 29 (the 11 change 2 exposed are closed by change 3) |

| reading | base | this change |
| --- | ---: | ---: |
| tests/cases functions with no blocker | 70,723 | 70,750 |
| armed tests/cases covered = verified = matched (functions) | 70,723 | 70,750 |
| corpus functions with no blocker | 45,329 | 45,330 |
| self-compile functions with no blocker | 20,037 | 20,037 |
| `ir-only-census`: tests/cases programs fully IR-only | 4,904 of 7,097 | 4,924 of 7,097 |
| deep-nesting margin, lowest passing stack | 900 KB | 900 KB |

Per mechanism, over IR-N5's 20 files (prototype seeds): change 1 +3, change 2 +13, change 3 +7
covered, all matched.

Legacy lines deleted: 0. Moved to `@ir`: 0.
