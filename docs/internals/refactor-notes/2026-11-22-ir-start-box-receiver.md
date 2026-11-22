# IR: a module global union as a box receiver (2026-11-22, lane IR-N3)

The forced IR-only census at 228cfa5e named `start: box receiver` the largest class: 164 functions in
164 tests/cases programs, the only missed class in 132. `irBBoxLocal` read a local, a parameter or a
walk variable, so a start body's narrowed field read of a module global union (`const sh: Shape`,
`if sh is Rect { print(sh.w) }`) or its box delivery missed.

## The change

- `irBBoxLocal(b, ix)` takes the block; a name with a declaration and no wasm local is
  `globalBoxRead`.
- `globalBoxRead`: not a capture of this frame (`emitUnionBoxPush` asks `emitCapturedRead` first),
  a `LetDecl` global whose cell is held as a box, read by `globalBoxAt`.
- `globalBoxAt` is the box read `globalUnboxRead` already built: `irGlobalReadMiss`, then the
  global's cell recovered where it is not a constant (`globalNameIsNonConstSid`), as
  `emitUnionBoxPush` writes `emitUserGlobalGet`. `globalUnboxRead` asks it too.
- An unstashed shared field read pushes its receiver once per arm, which a read temp is not; its
  global receiver is the named miss `shared read global receiver`.

## Measured vs merge-base 228cfa5e (fixpoint seeds on both sides)

- `vl run scripts/ir-only-census.vl -- --top 15`: 4021 → 4097 of 7047 programs fully IR-only (+76).
  Over the 161 programs the census tsv names for `start: box receiver`, the armed shadow leaves 0 on
  it: 97 start-matched, 34 next on `shared read global receiver`, 8 on `global read coercion`, the
  rest 1 to 3 each.
- Mode 5 over those 161: 161 of 161 builds byte-identical to the legacy build.
- Fixpoint after one refresh; `--names` self-compile identical; mode-3 self-compile byte-identical.
- `ir-identity.sh --claimless`: identical 14019, fail under both 3267, differ 0.
- `ir-identity.sh --cases`: identical 7615, differ 0; witnesses same 61, differ 0.
- tests/cases legacy A/B: identical 7335, differ 0.
- tests/cases armed shadow: start covered 5,910 → 6,011, start matched 5,909 → 6,010 (+101);
  `start uncovered box receiver` 170 → 0; `uncovered box receiver` 13 → 7. Corpus no-blocker
  functions unchanged at 45,093.
- Self-compile L2 fuel +0.01% per PR.

## Witness

`tests/ir-shadow-rows/start-global-box-receiver.vl`: a `const sh: Shape` narrowed to `Rect` and its
fields read in the start body.
