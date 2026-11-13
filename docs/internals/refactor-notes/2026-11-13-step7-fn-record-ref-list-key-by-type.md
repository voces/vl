# Step 7: a record holding a function keys its ref-list row by its type (2026-11-13)

`rlKeyTyOf` (emit_union_atoms.vl) declined two kinds of closed element type as a ref-list key:

- a type holding a type parameter;
- a record or list holding a function.

The second decline sent those rows through `rlInternNameTyK` with no type. The row key then came
from the spelling (`repElemIdOfNameTy(name, -1)`), which re-resolves the name with
`resolveAnnot`. The decline's comment said the name's row carries the record's function-value
sets. It does not: the name resolves to a type, and its key is that type's `repElemId`.

The function-value sets choose the record's **struct** row, through these paths:

- `rlRowMint`'s decline for a literal;
- `tagRepTyFn`, for a record of tagged sets;
- `rowOfTyUpToFnSets`, for a generic instance (D16040).

None of them reads `rlKeyTyOf`. So `rlKeyTyOf` now keeps only the type-parameter decline.
`rlRowOfTyMinted` keeps its own decline, since that one is the literal mint the sets decide.

## Probe 1: name key vs type key

At each `rlKeyTyOf` decline of a closed, function-holding type, the probe compared the name key
with the type key. 46 programs reach a decline: 33 agree and 13 disagree. The disagreements:

| site | programs | name | what differs |
| --- | --- | --- | --- |
| `shapeelem` | 10 | `R` | D9531 and its closure tests: an inferred `{f:(i32)=>i32}` spelled as a declared `R` whose function returns f64 |
| `mvrow` | 2 | `#anon0` | a probe artefact: the real key goes through `anonRowTyOfName` |
| `ann` | 1 | `{fs:((i32)=>i32)[],x:i32}` | a generic instance (`d15296_bound_returned`) |

In the `shapeelem` class the name key is wrong: it files the list under a declared type of another
signature. A second probe shows the row the call mints there is not read by the emitted module,
so neither key moves the output.

## Probe 2: unhinted `rlInternNameTyK` reach

The probe counted calls with no type, each of which parses its name, over the sweep population.

| | reaches | programs |
| --- | --- | --- |
| master | 130 | 79 |
| this change | 51 | 33 |

Nothing rose. Every name that fell holds a function: `R` (36 reaches), `{f:(i32)=>i32}` (9),
`{c0:(f64)=>f64,c1:(i32)=>i32}` (6), `W`, `P`, `S`, `T0`, `Holder` and others.

What remains is mostly not function-holding: `{f:i32}`, `i32[]`, `{r:i32}`, `{fs:i32[]}[]`, which
look like tag forms. Still function-holding:

- `{fs:((i32)=>i32)[],x:i32}`, in 6 programs: the generic-instance and `arrLitElemKeyTy` class;
- `{f:(i32)=>f64}`, in 1 program;
- two `#anon` handles.

One chunk of 300 programs timed out under both probe compilers. The sweep covers it.

## Measurement

This branch, swept against a fixpoint of its merge base: 24,239 programs the same, with 0
bytes-only movers, 0 output movers, 0 runs → not-runs and 0 new traps. The candidate swept
before the branch gave the same result over 24,235 programs.

Eleven hand witnesses are byte-identical, with the same output. They are now three cells under
`tests/cases/closures/fn-record-*`:

- B's map-value and annotated-list witnesses;
- lambda sets;
- named-function sets;
- R and Q twin aliases;
- map values mixing tagged and closure sets;
- records of function lists.
