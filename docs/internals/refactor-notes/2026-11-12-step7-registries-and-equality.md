# Step 7 L6: the spelling-keyed registries by reader, and the type-equality notions compared, 2026-11-12

Two items the exit criteria (`2026-11-11-step7-exit-criteria.md`) left owed under L6:

- an instrument that lists the spelling-keyed maps by reader, with program reach;
- the type-equality notions written up, each with its definition, its readers, and whether two of
  them disagree.

Both are measured on master `77d45015` (#7288), whose fixpoint seed is 6,623,600 bytes. The
population is the sweep's 23,925 programs.

## The registries: `scripts/registry-census.vl`

A text walk, like `vkind-census.vl`. It finds every module-scope map annotated `{[string]: V}` in
`compiler/emit_*.vl` and `wasmEmit.vl`, and every function, in any compiler module that declares
or imports the map, that reads, writes or resets it. A mention in a comment is not counted.

- `vl run scripts/registry-census.vl` prints one line per registry.
- `-- --list` adds each user.
- `-- --probe <dir>` writes a copy of `compiler/` in which each reader marks itself reached. Its
  `emitProgram` then replaces the program's emit error with the marks, so an earlier failure masks
  nothing. The marks are a base-64 bitset, which keeps them under the sweep's 220-character
  message cut.
- `-- --reach <sweep.jsonl>`, run from the same tree, folds a sweep of that build into programs
  per reader and per registry.

On this tree it finds **77 registries, with 133 reader uses in 93 distinct functions**. The census
and a grep of the declarations agree on 77. The line's old figure, 45 maps typed `{[string]: i32}`,
counts only one value type. The probe marked 92 of the 93 readers; one is a one-line function.
Its control is a program with a string literal, which marks the string-pool readers. 18,737 of
23,925 programs reach at least one reader.

**What keys them.** I read each registry's writers by hand to classify the key.

| key | registries | examples |
| --- | --- | --- |
| an identifier: a binding, field, function or alias name | 38 | `mll*` (8), `shr*` (8), `clh*` (6), `scopeTopOf`, `fdnDecl`, `nliFnIndex`, `elabAliasOf` |
| a composite memo key of indices | 18 | `elabSlotTys`, `elabCallInstSets`, `ekIndex`, `wsrHead`, `famRelay`, `cloAdapterCanon` |
| a type's spelling | **7** | below |
| literal content | 6 | `gStrPoolIx`, `gStrDataIx`, `litAtomId`, `msAtomIds`, `ieeeMemo*` |
| a type key by construction | 4 | `utkIds` (the canonical type key), `rtIntern` (the rep tree), `sRowLayRows` (layout), `uTagKeyGroups` (a row signature) |
| a diagnostic table no program reaches | 4 | `clsIx`, `repABIx`, `repShadowReasonIx`, `hcSeenStrId` |

Only the seven spelling-keyed registries are L6's deviation. Each with its program reach:

| registry | key | programs | owner and grade |
| --- | --- | --- | --- |
| `sNameIx` (`emit_atom_kinds.vl:302`) | a struct row's name, the index behind `structIndexByName` | 17,614 | convert with w324's name-producer switch (#7306) |
| `sitnMemo` (`emit_shape_rows.vl:1444`) | `structIndexOfTypeName`'s memo by type name | 3,549 | the same |
| `instKeyFirst` (`emit_inst_key.vl:19`) | mono's instance key | 9,369 | convert with mono's pin names (w317) |
| `monoTypedKeys`, `monoKeyEk`, `monoKeyPins` (`emit_mono.vl`) | mono's spelled pin keys | 9,369 each | the same (w317) |
| `cloSigPosBy` (`emit_state.vl:348`) | the `clo:` link key | 0 | floor: render-parse-residue's measured `clo:` key. Its readers are reached by no program in the population |

The other 70 are not registries keyed by spelling. Proposed: the §7 L6 line names these 7 and
retires its declaration count. `registry-census.vl` re-measures them.

## The equality notions

The line lists eight. One of them is not an equality, and the code has a ninth.

| notion | definition | live calls | files | what it equates |
| --- | --- | --- | --- | --- |
| `tySame` | `check_types.vl:3913` | 383 | 53 | two arena types of the same variant whose parts are the same, depth-bounded |
| `tyEq` | `check_types.vl:1346` | 110 | 39 | two types that render alike: union layers flatten, holes compare equal, field order counts |
| `repCanonId` | `emit_rep.vl:1581` | 33 | 14 | an interned canonical key; two types are one when their ids are equal |
| `tyEqSameHoles` | `check_types.vl:1322` | 23 | 10 | `tyEq`, with each inference hole equal only to itself |
| `tySameSet` | `emit_ty_canon.vl:464` | 15 | 6 | one type up to the order and repetition of union members, at any depth |
| `tySameSpelled` | `emit_ty_canon.vl:283` | 14 | 5 | one type once a Set is spelled as its boolean map |
| `tyEqSoftLits` | `check_types.vl:1337` | 4 | 3 | `tyEq` with a lone literal equal to its base scalar; the line does not list it |
| `tySameAnonRow` | `emit_ty_canon.vl:904` | 1 | 2 | two anonymous records with the same field names in order: a row question, not type equality |
| `tyEqNoneIsMap` | `tyquery.vl:1249` | 4 | 2 | not an equality: whether an `==` refusal is a map, a domain rule |

The live counts are grep counts of non-comment call lines, excluding definitions and import lines.

**The probe.**

- **What it compares:** the seven binary type equalities are evaluated on the same pair, during
  `emitProgram`, at each top-level call of one of them. `tySameAnonRow` and `tyEqNoneIsMap` are
  left out.
- **Where it hooks:** each notion's entry calls a hook. The hook runs only when no other notion's
  recursion is in progress: `tyEq`'s stacks empty and no softening or hole flag set, the
  `tySameSet`/`tySameSpelled` walk stack empty, and the canonical key's stacks empty. Otherwise
  a cycle guard would answer for a pair it is not comparing.
- **What it records:** each program keeps the set of agreement vectors (which notions call the pair
  equal) that are neither all true nor all false. `emitProgram` reports them in place of its
  result.
- **The witnesses:** a second build renders the first pair of each vector, run on that vector's
  smallest program.

**3,787 of 23,925 programs** compare a pair on which the notions disagree, in 12 vectors. Columns
read E for equal and · for unequal, in the order `tyEq`, `tyEqSameHoles`, `tyEqSoftLits`,
`tySame`, `tySameSet`, `tySameSpelled`, canon.

| vector | programs | witness pair | reading |
| --- | --- | --- | --- |
| · · E · · · E | 3,263 | `i32` ~ `7`; `"a"` ~ `"b"` | by design: softening and the canon key widen a lone literal to its base |
| E E E · E E · | 382 | `{a: T}` ~ `{a: T}`, two arena types | `tyEq` compares type parameters by name, `tySame` and canon by identity |
| E · E · E E · | 93 | `{f: (_) => _}` ~ `{f: (_) => _}` | the same, with distinct holes; `tyEqSameHoles` tells them apart, as designed |
| · · · · · · E | 54 | `Box2` ~ `{r: i32}` | the canon key is structural; the others keep the declaration |
| · · · E · · E | 43 | `i32` ~ `TVAddr` | a newtype brand: `tySame` and canon erase it, the render notions keep its name |
| · · · · · E E | 37 | `{[string]: boolean}` ~ `Set<string>` | by design: `tySameSpelled` spells a Set as its map, and so does canon |
| · · · · E · E | 23 | `{a: string \| i32}` ~ `P` | union members as a set |
| · · · E E E E | 16 | `{fs: (...)[]}` ~ `{fs: readonly (...)[]}` | `readonly` counts only for the `tyEq` family |
| E E E · E E E | 13 | `(i32 \| string) \| f64` ~ `i32 \| string \| f64`; `L1` ~ `L2` (declared recursive twins) | **`tySame` alone calls them different**: it does not flatten a nested union layer, and keeps declared twins apart. The canon key gives both one id (8 and 8, 4 and 4, read back by a witness build) |
| · · E · · · · | 10 | `{tag: "a", v: i32}` ~ `{tag: string, v: i32}` | **unexplained: `tyEqSoftLits` softens a nested field literal, but the canon key it says it mirrors does not** |
| · · E · E · E | 9 | `"a" \| "b" \| "x" \| "y" \| null` ~ the same members reordered | union order: the set notions and canon agree |
| · · · · E · · | 5 | `{a: i32, b: i32}` ~ `AB` | **unexplained: `tySameSet` equates them where canon, which equates `Box2` with `{r: i32}` above, does not** |

Grading:

- **Nine vectors are each notion's own contract.** Each notion was written to draw a different
  line: literal softening, type parameters and holes by name or identity, declarations, brands,
  Set spelling, union order, `readonly`. Two notions disagreeing on such a pair is what having nine
  notions means.
- **Three vectors are not explained by any notion's comment.** These are where the ruling needs a
  probe on each witness before floor or contract can be decided:
  - 13 programs: `tySame` alone splits a nested union layer from its flat spelling, and two
    declared recursive twins. Its comment says it compares components recursively; it does not
    say that a union layer counts.
  - 10 programs: `tyEqSoftLits` against canon at a nested field literal.
  - 5 programs: `tySameSet` against canon for a declared record.

  The canonical key is not split in any of them: every vector that has canon unequal is a notion
  drawing its own documented line. None of the three is filed. Whether each is a defect depends on
  the ruling, all 28 programs run, and their outputs match their `@log` lines or `Want:` blocks.

**Proposed for the ruling:** the nine contracts are one notion each and belong in §3.3's contract
text, not the deviation line. `tySameAnonRow` and `tyEqNoneIsMap` leave the list, since they are not
type equalities. The three unexplained vectors are investigated before that.

## Proof

- **The registry probe:** 92 readers marked, and its control fires. The sweep covered 23,925
  programs, and 18,737 of them reach a reader.
- **The equality probe:** its first build fired in 54 of 60 hand-run literal-union and union cases.
  The vector sweep covered 23,925 programs. Programs reaching no top-level disagreement kept their
  outcome.
- Both probe compilers were built by the master fixpoint seed into scratch and never refreshed into
  `build/`.
