# IR-M1: a record literal at a row open only in a tagged function set (2026-11-23, lane IR-M1)

The `i32>closure` half of the record field-storage disagreement. D17069 filed it as legacy choosing
function-field storage per row. A row dump on master e6cb8541 showed the storage is a function of
the row's recorded (elaborated) type: a field is an `i32` id exactly when its type is a tagged set
(`fnTagTyIsTagged`), a checker fact final before emit. So no legacy change is needed (coordinator
re-ruling 2026-11-23).

## The miss

`let r = { f: id1 }; r = { f: id2 }` with generic `id1`, `id2`. The literal's row records
`{ f: <tagged set> }`, which `irTyOpen` calls open because the set's members are generic.
`objLit`'s row branch refused an open row type, so the literal was built at its own
`{ f: typeof id1 }`, whose closure kid disagrees with the row's `i32` (`object field coercion`).

## The change

- `rowTyBuildsAt(rt, row)`: the row's type is closed, or each open field is either a tagged set
  the row stores as plain `i32` (`structRowFieldStoresAtom` answers 1), or a nested record whose
  own row (`sFieldTgtStructIdx`) passes the same test. `objLit`'s row branch asks it in place of
  `!irTyOpen(rt)`.
- `objLitAt`'s temp guard asks `irTyHeldOpen(ty, rep)`, as `irBLetTempTy` does. The facts pass
  marks such a variable held as ids, which verifier rule 1 admits.
- The delivery's own type (`ct`, two lines above) stays strict: none of the programs needs it.

A first cut asked only `irTyHeldOpen` of the row type. Four programs whose rows store the set as a
closure (their place keeps the closure) then built at the row and lost coverage downstream, net
-8 body functions. Asking the row's own storage removed every loss.

## The other 11 `object field coercion` programs

These are other mechanisms, not taken here:

- 5 are list or record element reps, where the record's rep and the row's agree and the field's
  value does not (`built-record-field-read-stored`, `built-record-join-binding-read`,
  `built-record-stored-into-nullable-field`, `same-elems-result-in-literal`,
  `hole-list-literal-in-record-field-at-two-types`). They belong to `index element coercion` /
  `array element coercion`, N1.
- 2 are D14752 literal-set relays (`layout-family-literal-set-beside-string`,
  `discriminant-set-beside-base-alias-arm`). They are lane IR-M1's next step on `rowFieldStorage`.
- 1 is the reverse of this family: a tagged destination over an untagged row
  (`record-pushed-onto-literal-records-of-wider-set-beside-returned-list`). Unowned.
- 1 is a record repointed at a subset of its function set, both types untagged
  (`record-repointed-at-subset-of-its-fn-set`). Unowned.
- 1 is a packed field (`flat-sub-word-storage`). Unowned.
- 1 is a nullable field called through a hole (`hole-guarded-call-through-nullable-field`). Unowned.

## Readings

Fixpoint seeds, head on master 9c7453e6, base master 9c7453e6.

| check | result |
| --- | --- |
| `$VL_IR_SHADOW=6` | distilled corpus 82,096 rows, 0 `prepost differs`; tests/cases 66,560 rows, 0 not the program's own refusal |
| `rep-fuzz-check.sh` | exact |
| `ir-identity.sh --cases` | identical 7712, fail under both 68, differ 0 |
| `ir-identity.sh --claimless` | identical 14042, fail under both 3267, differ 0 |
| `ir-identity.sh --names` | identical 9037, differ 0; self-compile identical |
| L2 self-compile fuel per PR | +0.01% on 120,150,056,802 |
| same-tree pair | 120,150,778,006 vs 120,150,798,386, +0.00002%, byte-identical output |
| armed shadow A/B | covered 76,342 → 76,344, start covered 6,695 → 6,700, mismatch and fail 2 → 2 |
| census | fully IR-only 5,669 → 5,675 of 7,143; `object field coercion` 7 → 5, `start: object field coercion` 15 → 8; `start: global read coercion` 31 → 32 and `start: ref if arm rep` 6 → 7 are the two starts that now reach a later miss |
