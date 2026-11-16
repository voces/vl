# Type hash-cons stage 4h: the emitter's `tySame` and `tyEq` graded against ids (lane H), 2026-11-16

What stage 4 leaves after 4g:
- The emitter's 31 `tyEmitEpoch` reads go with lane E's Rep ADT stage 3½/4.
- The checker's `tyMutEpoch` reads, the `tyEq`/`tySame` families and `assignable`'s memo go with
  L2.

So this lane's next targets are the emitter's own structural comparers. At master e1f7f37c the
emit side has 237 `tySame` call sites and 46 `tyEq` call sites, against 175 and 79 in the checker.
This slice is their shadow. Nothing switches.

## The id

`tySame` matches no existing flavour:
- it keeps no brand;
- it compares a record's fields as a name set;
- it compares a list without its view bit, and a function without its tag;
- it treats a literal, an error, a negation or a hole as equal only to its own row.

`CF_SAME` in `emit_ty_seal.vl` is that equality: `canonSameGo` and `canonSameObj`, plus two kinds,
`CK_ROW` (a row as itself) and `CK_BINDER` (a type parameter's slot). `tyEq` already has its id,
`CF_EQ`. Both flavours stay private to the shadow until 4i decides whether they survive.

## The shadow

The emit-side callers go through two wrappers:
- `tySameSealed(a, b)`, at 236 sites in 26 files;
- `tyEqSealed(a, b)`, at 46 sites in 12 files.

Each returns the comparer's answer. Under `$VL_ID_SHADOW`, each also compares that answer with `==`
on the ids. A first cut also split each reading by whether a mono fresh scope was open: no
comparison in the corpus ran inside one, and the split is gone.

- **Two cycles.** `emit_state.vl` keeps its one `tySame`, because `emit_bytes` imports it, which
  makes it upstream of this module. `unMemPeelAliasWrapper`, six lines over `check_types`, moves
  from `emit_union_tykey_text.vl` to `tyquery.vl`, which breaks
  `emit_ty_seal` → `emit_union_tykey_text` → `emit_state`. `emit_union_tykey_text` re-exports it,
  so its other importers do not change.

## Reading

The population is 19,940 files: all of `tests/cases` outside `modules/`, `distilled/cells`,
`distilled/named` and `compiler/entry.vl`. Of these, 15,472 reach emit.

| comparer | one row | both unequal | both equal | comparer true, ids apart | comparer false, ids met |
|---|---:|---:|---:|---:|---:|
| `tySame` | 761,830 | 5,750,819 | 156,913 | **12** | **0** |
| `tyEq` | 57,452 | 982,225 | 21,436 | **115** | **0** |

**No merge.** The ids never call equal two rows that the comparer calls unequal. So `==` on the ids
answers "equal" correctly every time it does.

**127 splits, in 9 files.** Two files split under both comparers. Every one is at a recursive type:

| comparer | splits | file |
|---|---:|---|
| `tyEq` | 99 | `types/self-recursive-map-arm-declares.vl` |
| `tyEq` | 8 | `maps/recursive-alias-map-into-union.vl` |
| `tySame` | 6 | `objects/intersection-alias-field-and-nullable-positions.vl` |
| `tySame` 3, `tyEq` 1 | 4 | `structs/recursive-nullable-field-equality.vl` |
| `tySame` 3, `tyEq` 1 | 4 | `types/intersection-alias-recursive-positions.vl` |
| `tyEq` | 2 | `generics/recursive-generic-alias-cons.vl` |
| `tyEq` | 2 | `soundness/recursive-nullable-alias-mutual.vl` |
| `tyEq` | 1 | `soundness/recursive-nullable-alias-functions.vl` |
| `tyEq` | 1 | `soundness/recursive-nullable-alias-list.vl` |

The two classes, read from the files and not ablated:
- **A named recursive record against its anonymous unrolling.** `type M = Node & { v: i32 }` builds
  `{ v: i32, next: Node | null }`. `Node`'s id cuts at its name (`CK_NOM`), but the unrolling's id
  is structural. `tySame` ignores names, so it calls them equal.
- **One recursive alias, rolled and unrolled.** A distance back-reference is not canonical for a
  regular tree; 3b found the same.

The comparer's answer is the right one in both classes, so neither is a wrong answer today and
neither is filed.

**What 4i does with this.** A content id that is canonical for a regular tree needs a partition
refinement over each cycle, which this lane does not propose. Instead, 4i switches on the measured
asymmetry:

    tySameSealed(a, b) = a == b || idSame(a) == idSame(b) || (cyclic(a) || cyclic(b)) && tySame(a, b)

Here `cyclic` means the id walk met a back reference or a nominal cut. An id hit is always right,
because the corpus has no merge. A miss on a cyclic type asks the comparer. The answer is today's
by construction, and the structural walk is left only for recursive types. The fuel delta is 4i's
reading.

**The layout shadow has 101 merges on master.** These are 4d's `tyRepId` against `repTreeOfTy`,
and master's seed gives the same counts in all four files:
- `soundness/recursive-nullable-alias-reassign.vl`: 66;
- `unions/litunion-nested-union-arm-module-global.vl`: 23;
- `generics/union-arg-into-generic-union-return-module-scope.vl`: 11;
- `soundness/recursive-nullable-alias-list.vl`: 1.

4d's zero was over its 1,839-file sample, which none of these is in. This is lane E's input for
re-keying `repOf` on `tyRepId`.

## Measurements

| reading | value |
|---|---|
| seed | fixpoint (two refreshes byte-identical) |
| identity, shadow off | 2,000 of 2,000 files byte-identical: a random 1,999 of the 19,940 plus `compiler/entry.vl` (the merge queue runs the full diff) |
| seed size | 6,349,140 → 6,353,715 bytes (+0.07%), against master e1f7f37c's fixpoint |
| phase-state census | surface: `emit_ty_seal.vl` 21 → 24 (`tySame`, `tyEq`, and `unMemPeelAliasWrapper` now from `tyquery`); `emit_union_tykey_text.vl` 14 → 15 (the re-export); 28 other files fall by 1 or 2; over the changed files 1,760 → 1,727. Baseline rewritten |
| net compiler lines | +227. `emit_ty_seal.vl` +159: the `CF_SAME` walk about 85, the wrappers and the shadow's tallies and report about 74. The helper's move +3. The rest is the formatter re-wrapping call sites under the longer names |
| pin helpers (`emit_mono.vl`) | 908 → 908 |
