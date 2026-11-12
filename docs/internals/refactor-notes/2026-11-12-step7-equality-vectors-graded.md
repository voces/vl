# Step 7 L6: the three unexplained equality vectors, graded, 2026-11-12

[`2026-11-12-step7-registries-and-equality.md`](2026-11-12-step7-registries-and-equality.md)
compared the seven binary type equalities on each pair any one of them was asked, and left three
agreement vectors unexplained. The ruling makes the notions a contract (ARCHITECTURE.md §3.3) once
those three are explained. Each vector was graded by the callers that ask **that** notion on
**that** pair. A disagreement on a pair some other notion was asked costs no caller anything.

Measured on master `cf01f012`, whose fixpoint seed is 6,735,476 bytes. The population is the
sweep's 24,170 programs.

## Method

Two probe compilers, each built by the master seed into scratch and never refreshed into `build/`:

- **Vector by caller.** At the entry of each notion (`tyEq`, `tyEqSameHoles`, `tyEqSoftLits`,
  `tySame`, `tySameSet`, `tySameSpelled`), when no notion's recursion is in progress, a hook
  evaluates all seven notions on the pair, with the canon key as `repCanonId`. A pair in one of
  the three vectors **at its own notion's entry** (vector 1 at `tySame`, 2 at `tyEqSoftLits`,
  3 at `tySameSet`) traps. A `--names` build's backtrace then names the caller. Callers
  already read were made quiet one at a time and the trapped programs re-run until none trapped.
- **Pairs.** The same hook in a second build reports the first matching pair as an `emitFail`
  message, with a tag naming the caller.
- **Control.** `tests/cases/structs/structural-twin-heap-dedup.vl` fires vector 1 at `tySame`
  (`L1 ~ L2`) on both builds, before and after the fixes below.

The probe saw each vector at some notion's entry in more programs than the note counted: vector 1
in 75, vector 2 in 10, and vector 3 in 6. At their own notion's entry the counts were 12, 1 and 0.

## Vector 1 — `tySame` alone splits: **a defect, fixed (D15952)**

`tySame`'s callers that met the pair, by the program and pair the probe named:

| caller | programs | pair | answer's effect |
| --- | --- | --- | --- |
| `luTsSpellsAs` (check_annot_resolve.vl) | 8 | `i32 \| string \| f64`, nested and flat | none: it asks `tySame \|\| tyEq` |
| `monoReadIsNarrowed` (emit_mono.vl) | 1 | `K \| L \| i32`, nested and flat | the place's held type is pinned, which is one type with the read's |
| `rrHas` (record_rows.vl) | 1 | `A ~ A2`, declared recursive twins | the twin is not the member, and a re-lay key is kept apart |
| `variantOwnRow` (emit_union_atoms.vl) | 1 | the same program | the arm finds its row by claim instead |
| `fieldElemSame` (emit_state.vl) | 1 | `L1 ~ L2`, declared recursive twins | the two slots resolve their rows by type |

None of the 12 printed a wrong value. The nested-layer pairs were then written into the one caller
that decides storage, `fieldElemSame`. That function is asked by `structFieldCodesEq` whether two
rows' list fields store one element. A record whose list field holds `(i32 | string) | f64`,
handed where `i32 | string | f64` is declared, is a check-clean invalid module on master. That
witness is D15952. A scratch build whose `fieldElemSame` also asked `tyEq` ran it and printed `3`.

So the nested layer is not a line any caller wants: it is a defect in `tySame`'s line. `tySame`
now flattens union layers in order, as `tyEq` does (`tySameMembers`). The declared recursive twins
stay apart. The depth bound is reached before a cycle closes, and both twin programs and a twin
list field handed across (`H2` to `H1`, with `L2[]` against `L1[]`) run with correct output. So
that is `tySame`'s documented line, not a defect.

## Vector 2 — `tyEqSoftLits` softens a nested field literal: **a defect, fixed (D15954)**

One caller met the pair at `tyEqSoftLits`. `wholeShapeRowOf` (emit_shape_rows.vl), the fallback
`repStructRowByShape` takes for a record with no row of its own, met `{tag: "a", v: i32}` ~
`{tag: string, v: i32}` in `tests/cases/unions/is-union-alias-over-nullable.vl`. That program
prints right, but the answer hands a `string` record a row that stores `tag` as the atom. A
`{tag: string, v: i32}` record built from a run-time string beside the `{tag: "a", v: i32}` arm is
a check-clean invalid module on master: D15954. The question is "which row stores this record",
and literal storage is part of it, so `wholeShapeRowOf` now asks `tyEq`.

The other three callers are the notion's own contract. Each pairs the softened compare with a
second test of how each field is stored: `armRowIsMember` (the literal sets per field),
`variantUnrolledTwin` (`variantFieldLayoutEq`) and `fieldTysRolledAlike` (a one-way fit). None
met the pair in the population. §3.3's `tyEqSoftLits` row now says that a row question asks `tyEq`.

## Vector 3 — `tySameSet` equates `AB` with `{a: i32, b: i32}`: **canon's defect, fixed (D15953)**

No `tySameSet` caller met the pair. The pair was asked of `tySame` and `tyEqSameHoles`, so
`tySameSet`'s answer reached nobody. The split is still a defect, and it is the canon key's:
`type AB = {a: i32} & {b: i32}` is a one-member union wrapping the merged record, because every
non-struct-bodied declaration is one. `hcUnionId` keyed that wrapper as a one-member union set,
apart from the record. `tyEq` and `tySameSet` peel the wrapper. The row dedup is keyed by the
canon key, so a record with an `AB` field, or an `AB[]` field, handed where the plain record is
declared, is a check-clean invalid module on master: D15953.

A union of one non-literal member now keys as that member, in both the interned id (`hcUnionId`)
and the string key (`repKeyUnion`), through `repUnionIsOneType`. A lone literal keeps its
one-member set, because that set is how a record field's literal stores the atom. `Box2` against
`{r: i32}` was never split: a struct-bodied declaration is the `TyObj` itself.

## Attribution

Each fix closes its own witness and no other. These are scratch builds over master:

| build | D15952 (nested layer) | D15953 (intersection alias) | D15954 (literal tag) |
| --- | --- | --- | --- |
| master | invalid module | invalid module | invalid module |
| the canon change only | invalid module | runs | not built |
| the `tySame` change only | runs | invalid module | not built |
| the `wholeShapeRowOf` change only | invalid module | invalid module | runs |

## Proof

- **Sweep**, both sides on fixpoint seeds (base `cf01f012`), 24,170 programs: 24,167 same, 0 output
  movers, 0 `runs → not-runs`, 0 new compiler traps. There are 3 bytes-only movers, all
  intersection-alias cells (`d362al_isect_unionmem`, `d362in_isect_unionmem`,
  `intersection-elem-permuted-arm-field-alias.vl`), plus the 3 new fixtures.
- **After the fixes**, the probe finds one vector at its own notion's entry, in 2 programs:
  vector 1 at `tySame`, both declared recursive twins (`A ~ A2`, `L1 ~ L2`). Vectors 2 and 3
  are found in none.
- Fixpoint (two refreshes byte-identical), `lint-self.sh` clean, `regress.vl` no runs lost,
  `check-filed-witnesses --strict` on both inventories 4,852 as filed, `rep-fuzz-check.sh` exact,
  seed size +2.3% against the baseline, late demands 8 against a baseline of 8, plumb-shape cost ok.

## The ruling's text

ARCHITECTURE.md §3.3 states the seven notions' lines with these corrections:

- `tySame` flattens union layers.
- `tySame` keeps declared recursive twins apart, and the row says why.
- `tyEqSoftLits` is never the row question.
- The canon key widens a bare literal but keys a field literal as its set.
- The canon key erases an alias's one-member wrapper.

`tySameAnonRow` and `tyEqNoneIsMap` were already off the list. The §7 L6 line had already lost
its "eight equality notions" figure, and it names only the spelling-keyed registries.
