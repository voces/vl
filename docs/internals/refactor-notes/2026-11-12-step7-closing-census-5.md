# Step 7 closing census 5 (DRAFT: the floor audit; the measures are filled when the coordinator asks)

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
| `synthTypeRefOfTy`, `lvSpellOf` (emit_rewrite) | a synthesized annotation is source text, checked again as source | class B, #7349 | reached by every program that synthesizes an annotation (20 callers); no row is named. Name one |
| `anonRowTyOfName`, `anonPinRow`, `retStructRowIndex`'s `#anon` rung | an `#anonN` handle is the literal row's identity | #7414, #7546 | D15646, D2762 |

**Defect found:** `cloCallSigRejectWhat`'s render comes out empty in both witnesses: "parameter 1 of
type `` has no representation in the function-value ABI". The floor holds, but its output names no
type. To be filed.

### Floors that fail a test

| site | fails | why |
| --- | --- | --- |
| `nulNicheIsTestImpossible`, `emitMapUnionPayloadTail` (wasmEmit) | witness | no program in the sweep reaches either message. Each also sits inside a "… yet" emit refusal, which is clause 2: the render is output, but the refusal is a capability gap, not a contract |
| `cloSigNameOfTy` and the `cloSigPosBy` registry | witness | no program reaches `cloSigPosBy`'s readers (registry census). An unreached key is a deletion candidate, not a floor |
| `rowDumpBuild` (emit_row_dump) | witness | a debug dump keyed by name; no witness, and outside the language contract |
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
| the loud floors: `emitIs` string-tag, `litStrMembersOutsideBox`'s box branch, `nliHoleHasType`, `nameFieldCodeTy`'s no-rung failure, `funcTypeShapeLowerable`'s nested-record recursion, `variantNestedShapeOkTy` | witness | each is an `emitFail` that no program reaches. A loud invariant with a contract message is acceptable as an assertion, but it is not a floor a census counts |

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
