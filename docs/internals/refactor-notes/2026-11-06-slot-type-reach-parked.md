# Slot type: `monoReachSlotTy`, parked and pruned

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §3.4 on 2026-11-07; its `§` references are to that file.

**Slot type, first reading: `monoReachSlotTy`** (2026-11-06). Value reach (`vrCalleeTy`) against
the climb's agreed tuple (`elabLitSlotCallTys`), each computed on its own:

| outcome | site-hits | files |
|---|---|---|
| agree | 314 | 161 |
| both decline | 505 | 253 |
| the elaboration only, reach declines | 228 | 107 |
| reach open, the elaboration declines | 26 | 20 |
| the elaboration only, reach open | 1 | 1 |
| reach only | 17 | 10 |
| differ | 0 | 0 |

The rung stays. The 17 reach-only site-hits are where the climb records no tuple, so they are the
next forward-climb edges to add:
- a list built by `push` or spread (`closures/hole-fn-generic-pushed-list-spread.vl`,
  `closures/hole-fn-into-pushed-lambda-bound-by-every-call.vl`);
- a lambda member of a capturing list (`closures/hole-fn-list-capturing-lambda-member-at-handed-result.vl`,
  `closures/hole-lambda-on-hole-fn-list-capturing-hole-param.vl`);
- a function field handed to a narrower declared parameter
  (`structs/record-with-generic-fn-field-into-narrower-declared-param.vl`,
  `functions/exported-generic-reached-through-lambda-field-or-list-called.vl`);
- D2853, D2862, D12880 and D12940.

The 228 the elaboration alone answers are calls mono leaves untyped today, so the switch admits them
too, and they are graded as newly admitted programs.

**Slot type, parked and pruned** (2026-11-06).

- **`monoReachSlotTy` is parked.** 13 of its 17 reach-only site-hits call the slot's function with a
  lambda argument whose type is open at the call (D12880, D12940, and the pushed-lambda and
  capturing-lambda-member tests). That is the lambda-signature family's, and lane F has them as
  acceptance witnesses. In D2853 and D2862 the call is through a field of a record a call returns
  (`mk(7).g()`), which the reach lane's value-returns family owns. The other 4 are answered by the
  binding's slot call tuple (`slotCallArgsInto`), which lands with the deletion. The rung keeps
  reach's decline for the 228 sites only the elaboration answers.
- **The 13 lambda-argument site-hits now have the climb's tuple.** The open argument is a generic
  function handed by name (`f(snd)`). `elabLitSlotCallTys` closes it, per slot value, at the one
  tuple that value's parameter is called at and the function's result there. Re-read on master
  `e925b06a` over 23,384 programs (counts per program and answer type): agree 175 → 180, reach only
  20 → 9, differ 1 → 1 (`named/d15209_fs_in_list_half.vl`, already on master), elaboration only
  132 → 132. No byte moves over the 19,316-program sweep. The 9 left keep the rung.
- **`monoReachSlotTy`'s value-reach rung is deleted.** The climb gained the 9 left: a value a call
  hands back or a lambda is climbed from its node; a reached call's result is its agreed or checked
  type, or, for a function result, the result's own calls (`ks[0]()(5)`, D2853, D2862); a literal
  an instance copied reads its source, and an argument open at check takes its agreed instance
  type; a spread copy reads its source's held values (initialiser, pushes, element writes, pushes in
  a function it is handed to) at the copy's own slot; a `self` function's UFCS calls count as its
  calls. Reach only 9 → 0, differ 1 (D15510), elaboration only 160. Reach's answers open in the
  enclosing generics' own type parameters (D7202) are kept by the climb (`elabOpenOnlyIn`). Against
  a master fixpoint over 19,316 programs: 0 runs lost, 13 byte movers, every one printing master's
  output. `vrCalleeTy`, `vrCallTy`, `vrOpen` and `monoFrameTyParamsOf` go.
- **Value reach's no-call half, dropped where it never decided.** Three gates ask
  `elabSlotUncalled(...) || reach finds no call`. Where the elaboration says the slot is called,
  reach alone said "no call" this often:

| gate | elaboration uncalled | reach alone | site-hits |
|---|---|---|---|
| `monoStoredSlotFnTy` | 136 | 0 | 136 |
| `monoPinNestedListElems` | 19 | 0 | 19 |
| `monoPinListElems` | 256 | 23 | 293 |

  The first two now read `elabSlotUncalled` alone. In the third, reach's answer stays: 23 site-hits
  in 17 files where the elaboration has no uncalled answer (D10795, D10796, D10893 to D10895, D12472
  and others). `monoValsInert` stays too, since it decides 34 site-hits with two pins that the
  elaboration has no fact for.
- **No longer mono-derived since #6496:** `monoPinRecordField`, `monoPinRecordFields` and
  `monoPinNestedListElems` read only the elaboration's slot pins (`monoDeclPathPins`).

**`monoPinnedRetAnnTy` is parked.** Re-keyed onto the forward climb (`elabLitSlotCallTys` over
each returned list literal, with each element's result) and shadowed over the 23,103 programs:

| outcome | events |
| --- | --- |
| both answer, agree | 11 |
| both answer, differ | 0 |
| old only | 18 |
| new only | 1 |
| neither | 1,027 |

The 18 old-only fall into two groups:
- 13 are an uncalled slot, which takes the unbound default (the D15293, D15207 and D15294 named
  sets; `named/d15293_string_alone.vl`). That belongs to the uncalled-slot and unbound-default work.
- 5 are a returned list reached only through a callback method or a hand-on
  (`hole-fn-list-unbound-and-returned.vl`), which the climb does not follow yet.

The switch waits for the default, then for that climb edge.

**`monoPinnedRetAnnTy` is switched** (2026-11-06). Each returned list literal closes from the climb
(`monoLitSlotCallTy`, which follows nested list rows). Where the climb does not close it, it closes
as the elaboration closes a held literal (`elabReturnedClosedTy` over `elabHeldClosedTyAt`, D15294's
fact) at the instance the call reaches. Ruling (a) keeps that fallback to a generic's instance or a
list holding no record. `monoCallInstRetTy` and `monoInstRetLitTy` are deleted.

The re-shadow over the 23,103 programs reads 27 agree, 1 differ, 2 new only and 1 old only:

- The differ is `named/d15293_bound_returned.vl` at `mk("s")`. The old answer was stale
  (`x: i32`, from the `mk(5)` instance), and the program prints the same output either way.
- The old-only case is `hole-fn-list-unbound-and-returned.vl`, one instance called at two types,
  where declining is correct.
- The 16 D15207/D15294 cells the fallback would also answer are declined. Admitting them moves no
  byte of any of the 23,103 programs: those cells are already served by `monoHeldRecordListAt`
  (D15294's reader of `elabHeldListFacts`), so they need no change here.

The byte sweep against master's fixpoint moves 2 of 23,103 programs with the same output:
`list-of-generic-returned-measured.vl` and `named/d15207_fn_list_ret.vl`. Each loses the dead body
of an uncalled list function, which the old path instanced as a side effect of `monoRetFnListTy`.
