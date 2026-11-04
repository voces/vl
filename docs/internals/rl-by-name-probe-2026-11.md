# The by-name ref-list row probe (step 7, record-row half)

Measured on master `4eaf52bb`, 2026-11-04, then again after the narrowed-read fix (#6263). This
is a shadow probe, not a gate. At each `rlSlotByNameTwin` call site it compares the row found by
name with the row the rep column's element type keys
(`rlSlotOfRowTy(rlRowTyOfElem(...))`), and notes one of these under `VL_REP_SHADOW`:

- `EQ`: both found the same row.
- `NE`: both found a row, and they differ.
- `NAMEONLY`: only the name found a row.
- `COLONLY`: only the column found a row.
- `NONE`: neither found a row.

A site's by-name rung can be deleted when it reads no `NAMEONLY` and no `NE`.

## Re-run

From a checkout root:

```sh
git apply docs/internals/rl-by-name-probe.patch
vl build compiler/entry.vl -o /tmp/rlprobe.wasm
git checkout compiler
(find tests/cases -name '*.vl'; find scripts/silent-sweep/distilled/named -name '*.vl') |
  xargs -P4 -I{} sh -c 'VL_NO_COMPILE_CACHE=1 VL_REP_SHADOW=1 vl build {} -o /dev/null \
    --compiler /tmp/rlprobe.wasm 2>&1 | grep "repAB/rlname"' > /tmp/rlname.txt
```

`VL_NO_COMPILE_CACHE=1` is required. A cached build replays the report of the compiler that
filled the cache.

## Readings, 17,605 files

| site | EQ | NAMEONLY | COLONLY | NE | NONE |
|---|---|---|---|---|---|
| `refListSlotOfExpr` | 7,257 | 9,166 | 0 | 114 | 541 |
| `fnRetRefListRowJoin` | 837 | 151 | 118 | 6 | 117 |
| `fnRetRefListDemand` | 832 | 151 | 54 | 6 | 186 |
| `refListElemNameOfIndex` | 290 | 117 | 0 | 0 | 0 |
| `synthEmptyListAnn` | 112 | 0 | 4 | 0 | 29 |
| `criRetRefListElemName` | 47 | 4 | 12 | 0 | 349 |

`criJoinedListKind` was not reached. `synthEmptyListAnn` read no `NAMEONLY` and no `NE`, so its
by-name rung is gone and the patch no longer probes it.

Where the column held a type, the disagreements fall into three groups.

1. **The column holds no list type at the read.** This group was 8,918 `NAMEONLY` calls in 332
   files.
   - 1,820 of them were narrowed reads whose rep was the storage union. #6263 closes those.
   - Most of the rest (6,629 calls in 196 files) are reads whose checker type is still open at a
     hole instance.
2. **The column's type is still open inside an instance.** This group is about 480 calls in about
   90 files.
3. **Both sides are closed and differ.** This group is 435 calls in 13 files, graded one by one:

| mechanism | files | calls | what the name carries that the column does not | waits on |
|---|---|---|---|---|
| M2, a record built wider or elsewhere | 5 | ~340 | the record-solve build of a call or literal, e.g. `keep([mkcall()])` read at the instance's `T` where the call's rep-keyed row (D15172) builds it at `Circle` | the per-argument delivered type ([per-argument-delivered-type-2026-11.md](per-argument-delivered-type-2026-11.md)) |
| M3, a function result built at its concrete record | 1 | 4 | `Circle` where the column reads the declared readonly view `Shape` | the result-side twin of the same fact |
| M1, a written hole-lambda list built at the stub | 4 | ~84 | the one `() => void` row such a list is built at across instances (D7142) | function identity, `Fn#d` (step 3/4) |
| M4a, a mixed-width integer literal-union element | 1 | 4 | the row of the members' bases (D6460) | closed here: `rlSlotOfRowTy` finds that row |
| M4b, a union element whose name row is one arm | 1 | 2 | `{w: i32}` for an `i32 \| {w: i32}` element | classifier-side, not a column gap |
| M5, a layout twin | 1 | 11 | `R` for a literal whose function field differs. The two rows lower to one struct, and D3180 says the literal is not `R` | classifier-side, not a column gap |

   The files are:
   - `tests/cases/closures/closure-array-composite-result.vl`
   - `tests/cases/closures/lambda-returns-readonly-record-view.vl`
   - `tests/cases/closures/written-let-in-list-called-in-two-instances.vl`
   - `tests/cases/closures/written-let-in-list-iterated-in-two-instances.vl`
   - `tests/cases/closures/written-let-in-record-field-called-in-two-instances.vl`
   - `tests/cases/closures/written-let-in-two-element-list-called-in-three-instances.vl`
   - `tests/cases/soundness/list-fresh-call-bare-literal-into-record-list.vl`
   - `tests/cases/soundness/mixed-instance-unrelated-arguments-runs.vl`
   - `tests/cases/soundness/record-call-list-handed-back-by-generic-runs.vl`
   - `tests/cases/soundness/record-literal-pushed-into-built-list-runs.vl`
   - `tests/cases/structs/record-literal-beside-declared-record-with-another-field-function.vl`
   - `tests/cases/unions/captured-copy-of-mixed-width-litunion-list.vl`
   - `tests/cases/unions/narrow-literal-list-builds-at-arm.vl`

Groups 1 (the open part) and 2 wait on the per-instance node type, group A of
[mono-pin-survey-2026-11.md](mono-pin-survey-2026-11.md).
