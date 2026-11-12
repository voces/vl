# Step 7: ten let and scalar kind readers that read a type NAME, converted or floored, 2026-11-11

w318's NAME-classifier census routed ten kind readers to the VKind lane. Each decides a kind
from a type's rendered name or spelling. Base is master `6138cd39`.

## The ten

| reader | name read | now | how graded |
| --- | --- | --- | --- |
| `constFoldOfLet` | `tyNameOf(letType) != tn` | `nodeTyPrimName(letType) != tn` | probe: 0 differ; control reaches 82 cells |
| `letInitIsLiteral` | `tyNameOf(letType)` against the four numeric names | `nodeTyPrimName(letType)` | probe: 0 differ; control reaches 18 |
| `letIsF32` | a raw `tyName == "f32"` fallback where the node has no recorded type | the recorded type only | probe: the fallback is reached in 0 of the corpus (no separate control; it fires only for a `let` annotation with no recorded type) |
| `lmaTypeName` | the parameter or result `tyName` against four numeric names | `nodeTyPrimName` | see below |
| `annScalarOrOpenArray` | four `nameIs*Array(tyName)` legs beside the element rep | the element rep alone | probe: a name leg decides where the rep does not in 0 cells; control reaches 2,518 |
| `annTyIsRefList` | `numLitUnionBaseName(e) == ""` | `numLitUnionBaseTy(e) < 0` | equivalent by construction (the name is the type's prim's) |
| `emitLetDeclStmt` → `emitLetInitValue` | `letAnnNm == "string"` | `nodeTyPrimName(letType) == "string"` | see below |
| `emitLetDeclStmt` | `letUNm = letAnnNm` | **floor** | the union box's registry name |
| `emitLetIfInit` | `nulNm = tyNameOf(letType)` | **floor** | the union box's registry name |
| `retFlagsSeedResult` | `retUNm = tyNameOf(fnRet)` | **floor** | the union box's registry name |
| `arrLitElemKindTpl` | the `arrLit*ElemName` producers | **floor** | see below |

`annTyIsRefList` keeps its `nd.tyName == ""` test. That test asks whether the annotation was
written at all: a synthesised parameter node has no spelling. It is a node fact, not a type name.

### `lmaTypeName`

It is reached only under `--low-memory-unused`, which the driver never sets, so the corpus never
reaches it. A hand program has two trivial i64 memory accessors, one taking an `Addr = i64` alias.

- **The control fires.** It is built `-O --low-memory-unused`, and the control fires there.
- **The probe does not fire.** The old-against-new probe stays silent.
- **The bytes do not move.** The module is byte-identical to base's.

`tests/vl_memarg_offset_test.ts`, which drives this path, passes: 9 of 9.

### `letAnnNm == "string"`

A probe of the name test against `nodeTyPrimName` differs in 7 cells. Every one is a single
string-literal annotation (`const x: "a"`): the name renders `string`, while the type is a
`TyLit`. Those cells are already admitted by the next disjunct, `tyIsBareStrLit`, so the
condition as a whole is unchanged on every corpus program. The `letAnnNm` parameter of
`emitLetInitValue` had no other reader and goes.

### The floors

- **The three union names** (`letUNm`, `nulNm`, `retUNm`) are the names a union box is coerced
  and registered under (`emitUnionCoerce`'s name argument). They are the union registry's
  identity, not a kind decision, and lane w302 owns that registry.
- **`arrLitElemKindTpl`** produces a ref-list element code (`RLK_*`), not a `VKind`.
  - It reads the literal's own build shape, before any frame types it. A probe compared it with
    `refListElemKindOfTy` of the literal's recorded element type: they differ in 268 cells (for
    example 97 where it says 4 and the type says 9). The literal is built at its
    shape, not at its recorded type.
  - Its program-wide `uDeclared` fall-through is ambient state.
  - So it is not a descriptor read today. It belongs to the ref-list codec work (w309), and is
    left for it.

## Proof

- **The probes:** each above was built by the candidate seed into scratch, validated by a control
  that fires, and swept over all 23,909 programs.
- **Gates:** each exits 0.
  - refresh, lint-self + fmt and `ladder-sets`;
  - rep-fuzz: exact;
  - the dead-export and render-parse budgets; seed-size is +0.5%;
  - probe-rollback, and `cases_wasm`: 7,440 passed, 0 failed;
  - `vl_memarg_offset_test.ts`: 9 passed;
  - distilled `regress.vl`: no runs lost.
- **The corpus identity** is the CI Sweep job's, in the PR.
