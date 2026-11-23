# IR: a record compare operand at its place, 2026-11-23

Lane IR-N4. Base: master 6cf67777d. Class `record compare place operand`, 23 `@start` bodies and
two functions on master 953e649b's fixpoint.

## Change

When legacy's `structEq` route does not stash an operand (`structEqStagesLeft`/`Right` false, so
`unionEqOperandOk` holds), `emitStructEq` re-reads it from its place at every field: `structEqRoots`
gets the place, not a local. The IR took only a plain variable there, and a top-level `const` is a
global, so every compare in a start missed.

- **Builder** (`structEqSide`): an unstaged operand may be a place chain (`structEqPlaceRead`). Its
  AST is a `Member` chain over a name, and its nodes are exactly the chain's `let`s in order: a
  global's read (`RGlobalGet`), a narrowed nullable variable's (`RRecover`) or a variable, under
  field reads (`RGetField`).
- **Lowering** (`structEq`): such a side (`structEqPlaceSide`) takes no local. Its temps are
  consumed unwritten (`irLSkip`, which skips a field read's receiver), and `structEqRoots` writes
  the place as legacy does.
- **Narrowing** (`fieldNullTemp`): a typed `null` field whose kid rep `k` its type does not intern
  to (`repNodeOfTy(repTyOf(k)) != k`) is the named miss `record field null rep`. The wider coverage
  reached `type T = { name: string, l: T | null, r: T | null }`, whose first null field's kid rep is
  a provisional nullable its type does not intern to, so the temp failed verifier rule 3. Master
  fails rule 3 on the same literal at a call argument; that is now the named miss too. The rep
  layer's cause is D17075, the record-literal and field-storage lane's.

Every new piece is a helper, out of `node` and the object-literal loop, whose frames a nested
lowering pays per level.

## Predicates and their legacy callers (R8)

| predicate | callers |
| --- | --- |
| `structEqPlaceRead`, `structEqPlaceSide` | `emitStructEq` through `structEqRoots` and `unionEqOperandOk` (`emit_base.vl`) |
| `fieldNullTemp` | none in legacy; it states `ir_verify.vl`'s rule 3 (`repNodeOfTy(vTy) == vRep`) |

## Legacy tails the IR calls

- None new.

## Witnesses

`tests/ir-shadow-rows/record-compare-place-operand.vl`: globals, field chains two deep over a
global, a parameter's field, a guarded nullable parameter, an assignment-narrowed local, and a call
beside a place on either side. Master's seed leaves six of its eight functions and the start
uncovered; this branch matches all eight and the start, with the same output and bytes.

## Readings (tests/cases census, master 953e649b's fixpoint seed against this branch's)

| class | master | branch |
| --- | ---: | ---: |
| start: record compare place operand | 23 | 0 |
| record compare place operand (functions) | 2 | 0 |
| starts covered and matched | 6789 | 6807 |
| start: nullable record eq | 2 | 5 |
| nullable record eq (functions) | 11 | 12 |
| start: record compare element place | 2 | 4 |
| start: record field null rep | 0 | 1 |

The starts this class unblocked that still block name `nullable record eq` (legacy's `nulstruct`
route), `record compare element place` and `record field null rep` (D17075).

## Proof

Fixpoint seeds on both sides, `VL_STD` the tree's:

- `scripts/gate.sh --fast` passed.
- Self-compile: 20332 covered, matched and claimed on both; modes 1, 3 and 5 build the plain bytes,
  the same as master's.
- `ir-identity --names`: identical 9037, fail under both 3267, differ 0; self-compile identical.
  `--claimless`: identical 14043, differ 0. `--cases`: identical 7712, fail under both 68, differ 0;
  witnesses same 62, differ 0.
- tests/cases legacy A/B: identical 7425, fail under both 67, differ 0; nothing moved.
- Order check (mode 6): 0 order rows over the distilled corpus and over tests/cases.
- `self-ir-misses`: 0 missed. Deep nesting: 8 passed; the labelled-loop margin passes at 910 KB
  and fails at 900, as master's seed does.
- Fuel: L2 120194810539 against master's 120194527311.
- Late demands 9 of 9, late tag rows 307 of 307.
