# Step 7 codecs: a one-literal field is stored at its one-member set, so its stored type reps as the atom, 2026-11-11

This follows #7160 (`2026-11-11-step7-codec-field-code-census.md`). Base is master `6c985ea7`.
Its fixpoint seed is 6,619,765 bytes.

The field code is the stored encoding the decoders read. Before a field's rep can come from
`repOfTy(sFieldStoreTy)`, the stored type has to rep the way the field is laid out. A probe
compared each typed field row's code kind with `repOfTy(sFieldStoreTy)`. In 227 of 23,885
programs, a field coded `0` (the atom) carried a stored type that the descriptor reps as `str`.
The field was a lone string literal (`kind: "syntax"`), stored as its bare `TyLit`.

## The ruling this applies

`one-literal-union-rep` (ruled 2026-10-13, `open-rulings.md`) says every string literal union reps
as the atom. D7220 applied it at a record field: a bare string literal at a field is its
one-member set, and the field code reads it as an atom. D7340 and D7446 apply the same ruling where
storage is decided, through `strLitAsSet` in `mkArrayTy`, `mkNullableTy` and `mkMapTy`. The field's
storage type was the one storage position still holding the bare literal. A declared result of one
bare literal stays `string` (D7445). So the descriptor's `TyLit` arm is unchanged, and the change is
made where the field's storage is decided, not in `repOfTy`.

## What changed

`fieldStoreTyOf` stores a lone string literal as `strLitAsSet(declTy)`. Code 15 is unchanged.
Every writer of `sFieldStoreTy` and `armStageStoreTy` goes through it.

No non-field position can change rep, because `repOfTy`, the checker's types and every local,
parameter, return and element type are untouched. The only readers that move are those of the
stored field type: `fieldPosStoreTy` and its cell-kind readers in `emit_classify.vl`.

## Measurement

The same probe, an `emitFail` marker after `emitModule`, was built by each side's fixpoint seed
into scratch and never refreshed into `build/`. It fires on a known control (a `kind: "syntax"`
field) and stays silent on a plain one. Programs per disagreement class, over the population
(`scripts/sweep.vl`, 23,885 programs):

| row class (code = stored-type rep) | base | candidate |
| --- | --- | --- |
| `c0 = str` (atom slot, `str` type) | 227 | **0** |
| `c0 = i32+atom` (agrees) | 195 | 400 |
| `c3 = i32+atom` (demoted to the string rep by `demoteLitFieldToString`) | 6 | 8 |
| `c15 = nulvariant` / `nulnone` (the type refines code 15) | 231 / 10 | 231 / 10 |
| `c30 = i32+atom` (agrees) | 51 | 51 |
| uncovered: holes and type parameters | 108 (per code) | 108 (per code) |
| `c37` / `c14 = nulclosure`, `c16 = i32` (a shared row's first writer) | 3 / 2 / 2 | 3 / 2 / 2 |

D14041 and D14042 were checked by hand (`check-filed-witnesses.vl --strict`): both grade as filed.

## What is left

- The 8 demoted rows are the remaining atom-rule deviation. `demoteLitFieldToString` re-lays a
  literal field under the string rep against the ruling, and it goes when its callers stop asking.
- Code 37, code 14 and code 16 rows can disagree with their stored type. A deduplicated row keeps
  the type of its first writer, so no single type is its storage. A field rep read from the type
  needs a row's rep to be the join of the types it serves.
- Holes and type parameters are uncovered by the descriptor by design. Those rows keep the code's
  answer.

## Proof

- Refresh ×2 is a fixpoint at 6,619,767 bytes (+2).
- `regress.vl`: no runs lost. `rep-fuzz-check.sh`: exact. `lint-self.sh`: clean.
- The corpus identity and mover list are CI's `sweep` job, per the standing instruction. The movers
  are in the PR.
