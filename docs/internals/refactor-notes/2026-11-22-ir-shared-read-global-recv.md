# IR: a shared field read off a module global (2026-11-22, lane IR-N3)

`ir-start-box-receiver` read a module global union as a box receiver through one read temp, and
left the unstashed shared field read a named miss, `shared read global receiver`. That read pushes
its receiver once per arm, and the verifier's `RSharedRead` rule wants a variable it may read more
than once. On the 161 tests/cases programs whose start body missed on `box receiver`, it was the
next blocker of 34.

## The change

- `RSharedRead` gains `srGlobal` (the module global, -1 for none) and `srGlobalNonNull`; with a
  global, `srV` is unread.
- The builder (`ir_build_ref.vl`) takes an unstashed shared read whose receiver is not a local to
  `irBGlobalBoxRecv`: `globalBoxSymOf` (not a capture, a `LetDecl` global held as a box, shared with
  `globalBoxRead`), then `irGlobalReadMiss`. The recover is `irBGlobalBoxRecovers`
  (`globalNameIsNonConstSid`), which `globalBoxAt` now asks too.
- The lowering's `sharedReadRecv` writes `globalRead(srGlobal, srGlobalNonNull)` for each push, as
  `emitUnionBoxPush` writes `emitUserGlobalGet` and its recover.
- The verifier checks a global receiver itself: its recorded cell (`irGlobalRepOf`) must be
  box-shaped and `srV` an unread immediate, else rule 2. Self-test case 24 is a global receiver
  over an `i32` cell, refused under rule 2.

## Witness

`tests/ir-shadow-rows/shared-read-global-receiver.vl`: `print(r.tag)` over two module globals of an
inferred `A | B`.

## Measured vs ir-start-box-receiver (fixpoint seeds on both sides; merge-base 228cfa5e)

- Fixpoint after one refresh; `--names` self-compile identical; mode-3 self-compile byte-identical.
- `ir-identity.sh --claimless`: identical 14019, fail under both 3267, differ 0.
- `ir-identity.sh --cases`: identical 7615, differ 0; witnesses same 61, differ 0 (again after the
  bound tests in `globalBoxSymOf`).
- tests/cases legacy A/B: identical 7335, differ 0.
- Mode 5 over the 34 programs: 34 of 34 builds byte-identical to the legacy build.
- tests/cases armed shadow: start covered 6,011 → 6,036, start matched 6,010 → 6,035 (+25);
  `start uncovered shared read global receiver` 34 → 0. Corpus no-blocker functions unchanged at
  45,093.
- Self-compile L2 fuel +0.02% per PR on 228cfa5e (the stack).
- Deep-nesting stack margin: fail 920 / pass 930 KB, the base's own edge.
