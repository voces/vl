# Step 7 slot layer, family B: what the checker would record as a record's declaration identity, 2026-11-11

Family B is the orchestrator's ruling on `structRowOfNameTy` and `variantIndexOf`. These ask a
**name**, because the name carries "declared as a union arm" and the type does not. The checker
should record each record's declaration identity (a declared arm, or a standalone record) where
it resolves one, and the emitter should read that beside the type. This note measures:

- how often the type cannot carry that identity;
- which read sites need it;
- where the checker would write it.

Base is master `98b73ba7` (#7132). Its fixpoint seed is 6,614,018 bytes.

## Method

The probe compiler was built from base and never refreshed into `build/`. It has two parts:

- **The class probe.** At `arenaFinal` it compares every pair of declared record names in the
  struct sidecar (`cStructNames` / `cStructTyIxs`) whose types are one type (`tySame`).
- **The site probe.** Each of the 63 `variantIndexOf` and `structRowOfNameTy` calls was tagged
  with its master `file:line`.
  - A `variantIndexOf` site counts when its name is a declared record that shares its type with
    a declaration of the other arm-ness.
  - A `structRowOfNameTy` site counts when its answer differs from `structRowOfRecordTy` of the
    type alone.

Both parts report once per program, at the end of `emitProgram`, so no class or site is masked by
an earlier one. A control program fired both parts: `Circle` is an arm of `Shape`, and
`CircleC = {r: i32}` is standalone. The sweep covers all 23,877 programs. Counts are **programs**.

## 1. How often the type cannot answer

1,857 programs declare two record names whose types are one type (D3870):

| class | programs | what the type loses |
| --- | --- | --- |
| **MIX**: one declaration is a union arm, the other is standalone | 1,029 | whether a value of the type is an arm |
| **ARM2**: arms of two different unions | 294 | which union's variant row |
| **STRUCT2**: two standalone records | 211 | nothing a row needs (one struct row) |
| **ARMSAME**: two arms of one union | 7 | which variant |

A program can be in several classes. `structNameOfTy(ty)` answers the first declaration
(`cStructFirstPos`), so in MIX and ARM2 programs the type alone answers for one of the
declarations and not the other.

## 2. Which sites need the identity

1,601 programs hit at least one site. The sites fall into five groups by where their name comes
from:

| group | programs | sites (master `file:line`, function) |
| --- | --- | --- |
| **a declaration's own name** | 1,036 | `emit_collect:6795` `collectNestedFieldShapes`, `:7020` `collectS`, `:9178` `declArmsMatchRow`, `:1259` `alcNamesArm`, `:3730` (`arms[ui]`) |
| **the mv kind ladder** | 1,099 | `emit_shape_rows:781` (struct rung, `arm`), `:786` (variant rung), `:5333` `structRowOfNameTy`'s own variant test |
| **a banked spelling** | 689 | `emit_shape_rows:1098` `rlElemStructRow`, `:1114` `rlElemVariantRow`, `emit_collect:4302` `rlElemVariantHeap`, `emit_map_value_slots:290` `rlElemLitStructRow`, `emit_union_atoms:549`/`:567` `mvShapeOfValNameArmTyGo`, `wasmEmit:9380` `armsHoldHeap`, `emit_shape_rows:3773` `refArrElemNameGo`, `:2143` `nameIsRefArrayGo` |
| **an annotation's `TypeRef` name** | 93 | `emit_nullable_rets:422` `annVariantRowOf`, `emit_sig_tokens:417` `fnRetVariantIndexSid`, `emit_classify:8589` |
| **the type's first name** | 83 | `emit_obj_lit_fits:985` `isTestedRowOf`, `emit_classify:1122`, `:10581` |

`emit_classify:4487` (`memberUnionFieldName`, 35 programs) is a `structRowOfNameTy` over a union
member's spelling. It belongs with the banked spellings.

The groups grade as follows:

- **A declaration's own name is BY DESIGN.** These sites ask about the declaration being
  collected (`s.tdName`, a `UnionDecl`'s member list), which is the identity itself.
- **The mv kind ladder goes with #7134.** On its branch, a caller holding a type asks
  `mvValKindOfTy`, and these rungs serve only untyped callers. That reach was 7 programs on the
  #7130 base. These sites are re-measured on #7134's merge, not converted here.
- **A banked spelling** is a row table that stores the name it was minted under. The table
  needs the identity stored beside the type at its mint, a column the mint writes from the node
  it mints for. It follows the bank conversions.
- **An annotation's `TypeRef` name** is resolved by the checker, which knows the declaration. One
  node column answers it.
- **The type's first name** is wrong by construction in a MIX or ARM2 program, unless the first
  declaration happens to be the one meant. These 83 programs are where today's answer is most
  likely accidental.

## 3. What the checker would record, and where

The identity is the declaration a record value or annotation resolved to: its `cStructNames`
position, from which "arm of union U" or "standalone" follows. The type is many-to-one onto
declarations in 1,029 + 294 programs, so the identity cannot live on the type. It is a node
fact, written where the checker resolves it:

1. **`TypeRef` resolution** (`resolveAnnot`): the declaration a `TypeRef` names. That is the
   annotation group's three sites, and the source for a binding or parameter annotated by name.
2. **A declaration's arm list** (`UnionDecl.udVariants`): each member name's declaration. The
   emitter already reads this as the declaration's own name.
3. **A record literal or value checked against a declared destination**: the destination's
   declaration, held on the value node. A banked row minted for that node reads it there, and
   the type's-first-name sites read it in place of `structNameOfTy`.

The emitter then reads `(type, declaration)` where it reads a name today. A node with no
recorded declaration (an anonymous shape) keeps the type's answer. That is the standalone case,
and no name answers it differently.

## 4. Order of the PR series

1. **The column and its first writer.** Write `TypeRef` resolution into a node column, and
   convert the annotation sites (93 programs, 3 sites).
2. **Value-node writer (3).** Convert the three sites that read the type's first name (83
   programs).
3. **The banked spellings.** Each bank records the declaration beside its type at the mint,
   bank by bank (689 programs, 10 sites). This is where `structRowOfNameTy`'s last
   `variantIndexOf` rung goes.
4. **Re-measure the mv kind ladder after #7134** and record what remains.

Literal unions are not records and never mint here. The rulings "one row per canonical type" and
"no mint-on-miss in a question reader" hold: the identity selects among existing rows, it does
not mint one.
