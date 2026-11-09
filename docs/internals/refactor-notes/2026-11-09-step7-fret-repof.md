# Step 7: the un-annotated `fRet*` columns read off `repOf`

Measured 2026-11-09 on a 4-core box, on master `17fc832d`. Every seed is a fixpoint (two
`refresh-compiler.sh` runs byte-identical). The sweep population is 23,799 programs.

## What sat between the recorded result and the columns

`fnRetColsFromRecorded` wrote an un-annotated function's columns from `fnRecordedRetCols` and
then ran five more steps. A probe compiler counted each step over the whole population (one
`$VL_CLS_CENSUS` entry per branch taken):

| step | files that took it | outcome |
| --- | --- | --- |
| `frsOwnRecordAtVariant`: a recorded variant read at the function's own record | 0 | deleted |
| `fnLambdaRecordRow` in `criColsFromRecorded`: a lambda's inferred-return struct row | 3, same row as the recorded read | deleted |
| `fnLambdaRecordRow` in `cloRetKeySuffix` | 6, same key as `repSigRetTokOfTy` | deleted |
| `fnRetRefListDemand`: intern the checked element's row when the recorded read named none | 0 | deleted |
| `fnRetRefListRowJoin`'s fallback to the checked element's row | 0 | deleted |
| `criRecordRowCheck` refusing | 0 | stands, as a guard |

With them go `frsCallsDeliverWider`, `tyIsStructWithUnionField`, `fnRetRArrElemTy` and `rsFnRetTy`. The
ref-list row join is now only the set-split check (`retListLitSetsSplit`, D15221), and it runs
in `criColsFromRecorded`, where the row is written.

## What the read is now

Each column is one read of the recorded result `r`:

* the kind is `repOfTy(r).rdKind`;
* the row is `repSlotOfKind(kind, r)`, and a ref list's element name is that row's;
* the literal-atom flag is `rdAtom`, and the boolean flag is `r == boolean`.

Two steps before the read only mint the rows it then finds:

* `criRecordedRefListDemand` mints a recorded list result's row (530 files).
* `criRetBindAnnMint` mints the annotation of each binding a result recorded with a hole returns
  (25 files).

No question reader mints on a miss.

## What is not one `repOf` read, with a witness

| arm | files | witness | why |
| --- | --- | --- | --- |
| a closure result mono lowered as its bundle record (`fnBundleRetRow`) | 17 | D15211 | `mk`'s recorded result is a function type, and it returns the row of the bundle's record |
| an open type variable after mono (`elabUnboundTpTy`) | 15 | D15308 | `id1` is only used as a value, so its result `a` is still open and is read at the type it takes unbound |
| a map with no token (its value type still open) | 189 | D14974 | `(x: i32) => Map()` records `{[string]: V}` with `V` open, and the columns name no row |
| a closure keyed `i32` | 226 | D1482 | the column vocabulary has no closure kind |
| declined: no token | 4 | D14082 | `() => p` delivered to `() => T \| string` |
| declined: recorded void or never | 1 | `checker-special-intrinsic-as-value` | |

`repOfTy(r).rdSlot` and `repSlotOfKind("struct", r)` differ for 389 files. `rdSlot` is the
nominal row (`repSlotOfTy`), and the columns take the structural one (`repStructRowOfTy`). So the
row cannot be `rdSlot` until the two struct-row readers agree.

## Proof

| check | master | this branch |
| --- | --- | --- |
| fixpoint seed, on `17fc832d` | 6,590,858 | 6,588,786 (−2,072) |
| sweep, 23,799 programs | | 23,799 same, 0 bytes-only, 0 output movers |
| fixpoint seed, merged with `18a749a0` | 6,591,066 | 6,588,981 (−2,085) |
| sweep on the merged tree, 23,800 programs | | 23,800 same, 0 bytes-only, 0 output movers |
