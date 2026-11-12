# Step 7 closing census 5: the floor audit

The measures section is added when the coordinator next asks. Until then this note is the floor
audit, re-graded on each check-in until its failing column is empty.

## The floor audit

Every site named a floor on 2026-11-12 was read. The sources are closing census 4's list and each
2026-11-12 refactor note's floor paragraphs, 43 standing sites in all. Each site was checked
against the three tests a floor must pass:

- **cites:** a row, a ruling or a PR;
- **reason:** a contract, not a mechanism;
- **witness:** a program that runs.

A floor whose reason is "waits on lane X" is a dependency, not a floor.

**Witnesses.** Every inventory row cited as a witness was read on master `8961b1cd`. All of them
run except D15809, an open loud emit reject. `check-filed-witnesses --strict` grades both
inventories as filed.

### Floors that pass: a contract, cited, with a witness that runs

| site | contract | cites | witness |
| --- | --- | --- | --- |
| `cloCallSigRejectWhat` ×4 (emit_closure_sites) | a refusal's message names a type for a person | render-parse-residue class B, #7349 | D15776, `objects/error-record-field-of-generic-called-under-shadowing-name.vl` (both refuse as filed) |
| `mapSoftTwinTagFail` (wasmEmit) | the same | the same | `generics/error-literal-union-map-twin-through-one-instance{,-plain-first}.vl` |
| `synthTypeRefOfTy`, `lvSpellOf` (emit_rewrite) | a synthesized annotation is source text, checked again as source | class B, #7349 | `arrays/map-returning-list-runs.vl` (378 cases reach it), `closures/capture-module-value-block-local.vl` (41) (#7646) |
| `cloSigNameOfTy` (emit_union_atoms) | the closure slot's name, rendered from its type | class B | `closures/alias-is-closure-arm-three-arm-union-call.vl`; 495 programs reach it (#7646) |
| `rowDumpBuild` (emit_row_dump) | a dump is a diagnostic label | #7414 | `tests/vl_row_classes_test.ts` |
| `anonRowTyOfName`, `anonPinRow`, `retStructRowIndex`'s `#anon` rung | an `#anonN` handle is the literal row's identity | #7414, #7546 | D15646, D2762 |

**Defect found and closed:** `cloCallSigRejectWhat`'s render came out empty in both witnesses
("parameter 1 of type `` …"). The diagnostic now renders with the checker's `tyToStr`, naming `T`
and `_`. Filed and closed as D15959 (#7640).

### Floors that fail a test

| site | fails | why |
| --- | --- | --- |
| `nameFieldCode`'s B171 arms (nullable-element lists the descriptor declines) | reason | "the descriptor declines them" is a mechanism; B171 is not a D-numbered row |
| `sRowsTwin` keeps the name (D15880) | reason | "the function-tag pass decides the storage" is a mechanism (witness runs) |
| `rlElemStructRow`'s name rung (D15552, ruled) | reason | a last rung after three type rungs, deciding 6 programs; ruled by the orchestrator, so cited. The reason is still a mechanism |
| `spellingHasStructRow`, `elemNameIsNominalAt`, `structRowOfSpelling`, `rowCanonIdOfName` | reason, witness | "a spelling predicate / API": mechanism, no witness. Lane B's name-producer road |
| `structRowOfAnnTyGo`'s nullable branch | reason, witness | "callers read the miss as a decision": mechanism |
| `structElemArrayLowerable`, `internFuncTypeShapesTyGo` parses | reason, witness | name and type disagree on nullability: mechanism (lane E) |
| `unionNameOfExpr` identifier rung (twin rows) | reason | "both consumers are order-blind": mechanism, though both witnesses run |
| `unionNameOfCall`'s literal-leaf return; its instance-hole and closure-array branches | reason; witness for the last two | "records no row": mechanism. The last two reach no program |
| `rlKeyTyOf` gate's declines | reason | "waits for the instance", and keyed by function-value sets: part dependency, part mechanism |
| `monoTagMapRepName`'s record pin text | reason | "until the interner can name that row by type": a mechanism with a dependency (below) |

### Resolved since the audit

- **Deleted (#7646):** `variantNestedShapeOkTy` and `litStrMembersOutsideBox`. Each was a loud floor
  whose caller already refuses, and each message appears in 0 of 24,189 programs.
- **Assertions, not floors (#7646):** `emitIs`'s literal-union string-tag test (soundness),
  `nliHoleHasType` (the checker's contract), and `nameFieldCodeTy`'s and
  `funcTypeShapeLowerable`'s uncoded-field defaults (the ladder rule). Each guards an invariant,
  and deleting it would turn a loud failure into a silent answer.
- **Re-graded (#7646):** `cloSigPosBy` is reached by 7,338 programs through `cloSigPosOfKey`, not
  by none. Its key is the `$fnsig` key built from rep tokens, so it is not a spelling-keyed
  registry. That leaves 5 spelling-keyed registries.
- **Clause-2 refusals with no reaching program:** `nulNicheIsTestImpossible` and
  `emitMapUnionPayloadTail` render a type inside a "… yet" refusal. No program in the sweep reaches
  either. Three hand-built variants of D2684's closed shape (a closure capture, a generic identity's
  return, a loop copy) do not reach `nulNicheIsTestImpossible`. They are filed as rows when a
  witness exists. Until then they are assertions, not floors.

### Dependencies, not floors: each waits on a lane

| site | waits on | cites |
| --- | --- | --- |
| `nameFieldCode` / `nameFieldCodeTy` literal-member-union arm | lane G's no-row class (w316, cuts 3–4) | #7250 |
| `fieldRowKind`; `objOrderStashSlot` and the `pushFieldStorage` code ladder; `sFieldStoreKind`; `fieldCodeCellKind` | lane H's field-code cuts 4–5 (#7250) | #7250, D1510 |
| `variantNestedRow` (E56), `armFieldStructRowMinted` (E16) | the shape walk handing those fields a type (lane E) | — |
| `sFieldRefSlot`'s name mint; `rlRowOfNameMinted` | the template field's element type at the instance (lane F) | #7342, #7306 |
| `internShapeDeepOfTy`, `internArmShapeRow` renders | lane E's E3: class R first, G on w314 cut 5, U on w317's D15042 | #7513 |
| `emitIfExprRef`'s record-join refusal (D15809, open) | the tag side (w308) | D15809 |
| `emitUnionBoxOwed` at `letBindingUnionTy` | the instance's type read there (w321) | D15713, D15710, #7443 |
| `monoTagMapRepName`'s record pin | lane B's row-identity cut (w324) | D15640, D15651 |
| `monoArmsNarrowFrom`, `monoWideArmsHoldBrace`, `monoArmCount` | the union key by type (lane G) | — |
| `monoArgTyNameProjected`, `monoAnonRowListTy`, `monoElabCompositeTy` | the struct-name producers (lane B) | D3900 |
| `monoNameIsGroupedList`, `monoInstanceFor`, `monoSlotPinAnn`, `monoPinAnnotatedParam`, `monoCellLamTakeAt` | mono's body-rewrite readers, lane D's next cut | the mono key census §3 |

### What the close can carry

Only the contract floors that pass go into §3.3 and §3.4's contract text:

- the diagnostic renders with a witness;
- the synthesized TypeRef texts, once a witness is named;
- the `#anon` row handle.

Each failing floor needs a conversion, a deletion if unreached, or a ruling that states a
contract. Each dependency closes with its lane.
