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

PENDING
