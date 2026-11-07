# A function-holding slot's identity set, as a shadow (2026-11-07)

This note covers lane step 1 of "a function-holding slot's rep comes from its identity set". It
follows [2026-11-07-rep-facts-behind-mono-guards](2026-11-07-rep-facts-behind-mono-guards.md). The fact
is in `compiler/elab_fn_id.vl` (`idSlotsBuild`, `idSlotSetOf`). It extends slice 2a's rules to slots:
- a slot is a list element, a record field or a map value;
- a write is a literal element or field, a `.push(v)`, a `.set(k, v)`, or an `a[i] = v` or `o.f = v`
  store;
- a slot's key is the named binding the literals around it are written to, plus the steps down
  (`B<decl>/[]/f`), else the outermost literal (`L<node>/…`);
- its set is the union of `idSetOf` over its writes, and open where any write is open or a spread.

`$VL_ID_SHADOW=1` prints one `slot` row per function-typed write. Each row gives the position, the
set class and three reps (`id` = a tagged set's member id, `clo` = a closure):
- the value's rep, as `emitExpr` builds it (`fnTagLeafId`);
- the checked slot type's rep (`fnTagTyIsTagged`);
- the held type's rep: `elabHeldValTy` of the outermost literal, or `elabSlotTyAt` of the binding,
  walked down the steps. This is the type #6711's guards protect.

No pass reads the fact, and with the flag off the output is byte-identical (§ Proof).

**Population.** These are the 23,611 programs of `scripts/sweep.vl -- list`, filtered by a source
regex to 4,114 that write a lambda or a declared function's name into a literal, `.push`, `.set` or a
store. On an 80-program random sample the filter missed 0 of the 8 programs with rows. 2,416
programs have at least one row, and they hold 6,153 writes in all. To rerun:
`scripts/id-shadow/run.sh --rows SEED LIST OUT`, then `tally.sh OUT`, section (e).

| verdict | writes | meaning |
|---|---|---|
| `static` | 1,460 | singleton set, built as its member id: a static call |
| `tag` | 1,601 | a set of 2+, built as ids of a tagged set covering it |
| `clo-set` | 725 | a set of 2+, untagged, built as closures |
| `clo-single` | **2,014** | **singleton set, built as a closure: the cost today** |
| `open` | 279 | some write is a parameter, call result or spread (41 of them are ids) |
| `split` | 61 | the value's rep differs from the checked slot type's |
| `id-uncovered` | **13** | **built as an id of a tagged set that lacks a member of the slot's set** |

**The held column is where the guards live: 782 writes in 336 programs** are built as an id where
the held type says closure:
- 408 `static`, 361 `tag` and 13 `id-uncovered`;
- by position: 561 list, 70 field, 110 store, 28 set and 13 push;
- it includes the guard witnesses `d15221_opt_dbl` (field `s.f`), `hole-fn-map-record-returned`
  (store `hm["k"]`) and `d15293_called` (list `[inc0]`).

The no-token class (`d15207_bound_twin`, `d15203_run_uncalled_local_returned`) and
`d15293_called_two` read `clo-single`: a singleton built as a closure.

**`id-uncovered` is the "index for a set" class, named.** It covers 13 writes in 13 programs, all of
the shape `[{f: inc0}, {f: dbl}]`: one slot written with two functions, one called and one not. The
called one is an id of its own singleton tagged set, and the other is a closure in the same slot.
- 10 are loud emit rejects as filed: `d15221_{lit,deep,nest,reb,ufcs,arg}_dbl`,
  `d15203_loud_mixed_{set,nested}_records`, `d15209_mixed_one_dbl` and D15228.
- 3 run: `sc3505_x01`, `sc3505_x06` and `list-element-zero-written-with-generic`. Each writes into a
  binding whose later store re-tags the slot.

None is a live miscompile. Under the ruling, these are where a slot needs its own set, `{inc0, dbl}`,
tagged as one.

**`split` is a conversion, not a miscompile.** The 61 writes are in 19 programs (the
`*-fn-widened-*` cases, D15306/7 and D15335/6), and all 19 run. A slot type wider than the value is
served by a converting write.

## What step 2 has to do

- A slot's rep must be `repOf` of the slot's identity type: `elabFnSetTyMint(fnTy, idSlotSetOf(key))`.
  It must be read at the build site and by every consumer. Today the value's rep is per leaf
  (`fnTagLeaf`) and the held type's is per type index. The 782 held-splits are those two
  disagreeing.
- The 2,014 `clo-single` writes would become ids: closures replaced by static dispatch. The other
  direction (static to indirect) has 0 writes under the ruling. Static calls were not counted; this
  counts writes.
- `id-uncovered` needs the slot's set tagged as one set. That means the tag decision is made per
  slot key and not per call, which is a `check_fn_tag.vl` change outside this lane's files.

## Not covered: instances

The shadow reads the checked tree and the program's frame. A generic template's held type is `-`,
and mono's instance copies do not exist yet when the snapshot is taken. So "per instance" is not
measured here. `d15293_called_two`'s two instances read as one row.

## Proof

Both seeds are fixpoints (each refreshed twice to byte-identical). With the flag off,
`scripts/sweep.vl -- diff` of master `a2dd4b66` against this head reads 23,611 same, 0 bytes-only,
0 output movers and 0 `runs → not-runs`. Seed size: 6,476,435 → 6,486,042 bytes (+9,607, +0.15%).
After merging master: the fixpoint is 6,484,727 bytes and `scripts/gate.sh` passes 23 of 23 rows.
