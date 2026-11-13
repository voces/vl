# D15975 design: `===`/`!==` reference identity, 2026-11-13

Lane E, design and probe only; no compiler change. D15975: the owner ruled `===`/`!==` as
reference identity on 2026-09-01 (`docs/identity-design.md` §0, DECISIONS A15), but the
operator is unbuilt, and the parser refuses it with a message naming the rule the ruling
reversed. All measurements are on master `0260e578`.

## Prerequisite: the owner's reconfirmation

ROADMAP item 5, track-a A15 and open-rulings §E all say the owner reconfirms the 2026-09-01
ruling before it is built, because DV-1214 since taught users "VL has no `===`". Nothing below
is scheduled until that is recorded.

## Witness, re-run

`check-filed-witnesses --strict` on D15975 gives `check_reject`, as filed. Today's refusal is
`strictEqTail` (compiler/parser.vl), which consumes the third `=`, reports
``VL has no `===`; `==` is already strict`` under `STRICT_EQ_CODE`, and `check --fix` drops it
(`cliNoteStrictEqFix`, compiler/cli.vl).

## Mechanism

This is not a defect with a minimal witness to delta-debug: the operator does not exist. The
row's ablation stands: `a == c` runs structurally, and `1 === 1` gets the same parse error
where the ruling owes a check error. No corpus program spells `===` or `!==` outside a comment
or a string (grep over every `.vl` file in the tree), so the corpus has no cell to move.

## Position matrix: six templates, one per reference rep the ruling names

`scripts/capability-probes/matrix/identity-eq-{record,list,map,fn,nullable-record,record-union}.matrix.vl`.
Each delivers an object through every position, then tests `v === src` (`!==` in the list and
map templates). Its second instance is a structurally equal object built elsewhere, which must
answer `other`.

| template | `===` on master | `==` control (`===`→`==`) |
| --- | --- | --- |
| record | runs 0 of 66 (66 parse refusals) | 64 of 66; `two_instances` WRONG ×2, the structural answer |
| list | runs 0 of 66 | 64 of 66; `two_instances` WRONG ×2, the structural answer |
| map | runs 0 of 66 | 0 of 66, `==` refused by design; with a `v.length` test, 64 of 66 |
| fn | runs 0 of 66 | 66 of 66 (`==` on a function is identity today) |
| nullable-record | runs 0 of 66 | 66 of 66 |
| record-union | runs 0 of 66 | 65 of 66; `local_assign` annotated is an emit refusal, filed as D16034 |

The controls show that every template delivers its value at every position on today's
compiler, so the `===` columns measure the operator alone. Probing the operands turned up two
`==` gaps on the operand types `===` will share. Both are filed:

- **D16033:** `A | null == A` is refused once any union holding `A` is declared.
- **D16034:** a union `==` whose left operand is a `let` is refused.

## Plan

1. **Parser.** `strictEqTail` turns into the spelling: an `=` adjacent to `==`/`!=` makes the
   `BinExpr` op `===`/`!==` at the same precedence. No new token kind, so the exhaustive token
   ladders are untouched. Then delete `STRICT_EQ_CODE`, `cliNoteStrictEqFix`, and the
   strict-equality cases in `tests/cases/parser/` and `tests/vl_check_fix_test.ts`. The fmt
   printer reprints the op text.
2. **Checker** (`check_operators.vl`, beside `checkEqualityBinNode`).
   - Operands: a struct, list or array, map, function value, a nullable of one, or a union whose
     arms are all records.
   - Scalars, `string`, and a union with a scalar or string arm are one template, rendered at
     the user's spelling: "`===` compares identity, and `Id` has none — use `==`".
   - Mixed brands reject as every operator does.
   - `null === null` folds to `true`. `x === null` is legal, carries a hint pointing at
     `== null`, and narrows as `== null` does.
3. **Emitter.** One `ref.eq` per rep, over the operands' raw values.
   - A record union is a `{i32 tag, anyref payload}` box per widening site (seen in `wasm-dis`
     of `A | B` parameters), so each union operand reads field 1 and casts to `eqref` before
     the compare. The box itself is never compared (ruling 2).
   - A function value reuses today's closure `==` core: table index, then `ref.eq` on the
     environment.
   - A nullable needs no guard: `ref.eq` holds two nulls equal.
4. **Generics** (A13's inferred operator constraint) report at the call, on the argument. This
   is a later step; until it lands, `===` on a type parameter is a check error that names the
   gap.
5. **`==` on two functions as a check error** (ruling 7) is a separate PR. It turns programs
   that run today into check errors. DECISIONS ("`==` reads one slot") already records that the
   compiler departs from that line. It needs the corpus measured and its own ruling check.

### Audit population

Op-string sites that test `"=="`/`"!="` and must say what `===` does: about 110 lines across 30
files. The largest counts are wasmEmit.vl 17, emit_fn_scans 9, emit_base 5 and emit_mono 4; the
checker has 3 in check_operators and 3 in check_narrow_flow. Each one either takes `===` or
fails loudly. None may fall through to arithmetic.

## Expected movers

- Corpus: none, since no cell spells the operator.
- Matrices: all six move from 0 to 66 of 66 runs.
- Tests: the strict-equality parser case and the DV-1214 `check --fix` test change by design.

## Size and independence from step 7

Parts 1 and 2 are independent of step 7. Part 3 reads the record-union box's payload slot,
which is the representation step 7 is re-keying, so it should land after step 7 closes or build
on its readers. The work is three PRs (parser and checker, emitter, `==` on functions), not a
small one.
