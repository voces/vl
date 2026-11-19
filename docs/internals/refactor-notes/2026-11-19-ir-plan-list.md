# IR decision modules 1: the list plans (2026-11-19, lane IR6)

§10.1(a) stage 3 moves every shared decision the IR reads out of `wasmEmit.vl` into byte-free
decision modules, `compiler/emit_plan_<family>.vl`. This is the first, and the pilot that prices
a move.

## The inventory

`scripts/ir-driver-census.sh` over the self-compile plus 20,922 programs (the distilled
`cells/` and `named/`, and every `tests/cases` program), master c68092be on a fixpoint seed:

| role | functions with door `@ir` | lines |
|---|---|---|
| decide | 393 | 5,891 |
| value | 89 | 1,862 |
| ast | 1 | 27 |
| all | 483 | 7,780 |

392 of the 393 decide functions also have a legacy door, so the stage is mostly moves of
decisions both sides already share.

The role column is a heuristic: 18 of the census's decide rows write bytes. So a move is gated on
a static check instead, over a name-level reference graph of `wasmEmit.vl`.
- The IR modules import 142 names from `wasmEmit.vl`, and 97 of them write no bytes (no `w*`/`fb*`
  writer is reachable).
- Their callee closure is 401 functions in 5,952 lines, none of which writes bytes. So the
  closure can sit below `wasmEmit.vl` with no import cycle.

Cut by family, with helpers shared across families in a module named by what they decide:

| family | functions | lines |
|---|---|---|
| shared across families | 65 | 785 |
| list | 60 | 1,244 |
| union, `is`, narrowed | 76 | 1,356 |
| control | 67 | 1,018 |
| string, print | 35 | 465 |
| null, coalesce | 30 | 408 |
| numeric, widen | 33 | 391 |
| map | 12 | 111 |
| global, start | 12 | 98 |

What deletes:
- the 27 IR-only mirror predicates (`*Plain`/`*Why` that legacy never calls), 344 lines of their own;
- the eight legacy writers called whole, about 0.2k lines.

## This step

Moved: `pushPlanOf`, `popPlanOf`, `popStmtPlainWhy`, `idxStorePlanOf`, `listReserveScan`,
`arrLitArmOf`, `forInLoopAt`, `identReadIsList` and `arrLitListBuild`, with their closure. That is
51 declarations and 1,231 lines with their comments.

- `arrLitShort` stays in `wasmEmit.vl`, because it reads `gForIterLit`, which legacy's
  `emitForInList` writes.
- `emitArrLenHeld`, one of the writers called whole, is already a shared plan
  (`arrLenHoistOf`) plus a tail. What it reads is the loop-hoist frame (`lhLen`), which is the
  frame-model row of §10.1, not a decision.
- The pop statement's mirror (`popStmtPlainWhy`) waits. Making legacy's `.pop` ladder consume a
  shared arm reshapes `popDropTail` and `pushTake*`, which IR4's next re-entry step owns.

Deleted: `arrLitBuildOf`, an alias of `arrLitListBuild`. The IR now calls the shared decision.

`tests/vl_emit_plan_modules_test.ts` holds every `emit_plan_*.vl` to the module rule:
- no import from `wasmEmit.vl` or any `ir_*.vl`;
- no byte writer or `emitExpr` imported;
- a header saying it writes no bytes;
- no `*_helpers` name.

Its control, a module breaking each rule, fails all five.

## Lines

| | lines |
|---|---|
| moved (declarations with their comments) | 1,231 |
| deleted | 5 |
| new module's header and imports | 167 |
| compiler net | +164 (+1,448, −1,284) |

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; 6,760,918 bytes against master's 6,760,941 |
| corpus identity, master fixpoint vs this fixpoint | 9,034 identical, 3,267 fail under both, 0 differ, 0 one-only; self-compile identical |
| `--names` identity | the same, self-compile identical |
| `ir-identity.sh --cases` | 7,508 identical, 68 fail under both, 0 differ |
| mode 3 (this seed under `$VL_IR_SHADOW=3` against master's default) | 9,034 same, 0 differ, 0 one-only; self-compile identical |
| shadow | 30,648 covered, verified and matched; `ir-shadow: ok` |
| `--claims` | 30,648 functions emitted by the IR; `ir-shadow: ok` |
| L2 self-compile fuel | 98,670,948,575 (master) to 98,680,491,212 (+0.01%) |
| seed size | 6,760,918 bytes, baseline 6,749,691 (+0.2%) |
| late demands | 9, baseline 9; late tag rows 307, baseline 307 |
| phase state | wasmEmit.vl surface 276 to 273, `emit_plan_list.vl` 17 (new), baseline rewritten |
| lint-self, ladder sets | clean; 53 closed sets match |

## The price of a split

The phase-state census counts checker imports per module. A symbol both the moved code and
`wasmEmit.vl` still use is now imported twice. Distinct checker symbols are unchanged at 1,187,
and imports rise from 2,746 to 2,760 (+14). The moved functions import no checker symbol
`wasmEmit.vl` did not already import. Each later family adds such a count, and it falls only as
legacy's remaining users of a symbol delete.
