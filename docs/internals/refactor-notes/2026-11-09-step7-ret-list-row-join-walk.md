# Step 7: the inferred list result's per-value row join is deleted

Measured 2026-11-09 on a 4-core box. Both seeds are fixpoints (two builds byte-identical). The
base is master `553d860c`. The population is the sweep's 23,775 programs.

## What moved

`fnRetRefListRowJoin` (`emit_collect.vl`), the ref-list row `fnRetColsFromRecorded` writes to
`fRetRListRow`, is the recorded result's row, else its closed element type's row. Its walk over the
returned values is gone, along with the row each value is built at (`retListValueRow`) and the
check that one value's function sets widen into another's (`retListSigWiden`, `retSigSetAt`,
`retSigNumEnd`, `retSigNum`). That walk ran only when the recorded result named no row and its
element type was open.

## What stands, and why

One check still walks the returned values: a literal whose elements hold different function sets,
under a recorded row whose type holds a function (`retListLitSetsSplit`). It is `-2`, the emit
refusal `the lists this function returns are built at different rows`. It runs only for a list
result whose type holds a function.

Deleting it too was measured first:

| step | same | output movers | new traps |
| --- | --- | --- | --- |
| the whole walk deleted | 23,772 | 3 | **3** |
| the split check kept | 23,775 | 0 | **0** |

The three are `d15221_slice_half`, `d15221_sliceb_half` and `d15294_two_records_called`. Each
is `mk().slice(0, 2)[1].f(3)` over `[{ f: inc0 }, { f: half }]`. Without the refusal each one is
check-clean invalid wasm. Their bound twin (`const rs = mk()`, then `rs[1].f(3)`) is a check
refusal (D15221). The slice route reaches no judge, so the refusal stays in emit until the
checker judges a call through a sliced result.

The rest of the population moved nothing, not even bytes, so no program in it reached the
per-value join.

## Proof

* Sweep diff, base against candidate: 23,775 same, 0 bytes-only movers, 0 output movers.
* Seed: 6,583,848 bytes against base's 6,585,897 (−2,049).
* Plumb-shape cost: fuel is identical to base in both units, and peak RSS is 320.5 MB against
  base's 320.3 MB (main) and 318.2 MB against 318.1 MB (tail).
* `rep-fuzz-check.sh`: exact.
