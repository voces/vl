# A `.map` / `.filter` callback that writes a statement: split at legacy's store (lane COV-UNION, 2026-11-26)

## The refusal

`xs.map(if c { inc } else { dbl })`. Legacy writes the list, its tail `mfRecvTail` (which stores
the list into the call's source local), then the callback expression, then the loop. The IR
builds the callback's valued `if` as a statement ahead of the call, so it refused the shape
(`map callback expression`).

## Tried and dropped

- **Staging the list below the callback's `if`** (`irBStageLeads`). The builder took it
  (blockers none), but the lowering failed `stack value read out of order`, 4 functions in
  `fn-choice-as-callback.vl`: `mfRecvTail` cannot consume the list from under the `if`'s out.
- **Spilling the list to a frame local** (the coordinator's general remedy, evaluated first).
  Legacy writes no spill local, so a spill is byte-different here and for every other op whose tail
  is hostile to staging. It cannot reproduce legacy's order.

## The change (coordinator ruling: "split at the op's own store")

`mfRecvTail` consumes the list entirely into the call's source local and leaves nothing on the
stack. So the call splits there:
- a head statement, `RMapFilterHead { mhV, mhAt }`, written ahead of the callback's statements.
  Its lowering asks the plan and the callback slot (`mfCallbackLocal`) as `lowerMapFilter` does,
  then writes the list and `mfRecvTail`;
- the callback's statements, as built;
- `RMapFilter` with `hfV` the no-value immediate (headed). It writes the callback's out and the
  loop.

The head is written only where the callback writes a statement (`stmtWrittenFrom`, any class but
`temp`). A callback that only reads a capture builds a temp, and splitting it mismatched the
element-read spans of `fn-param-shadows-module-fn-callback.vl`'s lambda; that is how the rule was
found. The head's statement class is `listStage`, a receiver stage written in place, like
`RListStage`'s.

## Measured

Both arms run from their own checkout: master `f1386269e` from a base worktree, and this tree.
The population is tests/cases plus the 65 regen-9 COV-UNION programs.
- `map callback expression` 8 → 0, `map short-circuit operand` 1 → 0. No class rose.
- tests/cases:
  - unclaimed distinct functions 248 → 242;
  - start bodies 133 → 131;
  - programs fully claimed 7,889 → 7,894.
- Witnesses: start bodies claimed 6 → 7 of 14.
- `ir-identity.sh --cases`: differ 0. The class's programs are byte-identical to the claimless
  build.
- `VL_IR_REQUIRE_CLAIM=1` (a host built at #10319): each of the class's 6 programs and the sweep
  pass on this tree. D9072's witness fails on master and passes here. The control (the sweep on
  master's seed) fails.

Q58 sweep: `tests/cases/closures/map-callback-expression-positions.vl`.
- Positions: an `if` and a `match` choosing the callback; over a parameter, a literal and a bound
  list; `.filter`; a callback holding its own `.map`; inside a lambda; at the top.
- Master blocks 5 functions and the start body (`map callback expression`). This tree reports
  blockers none and matches under `VL_IR_SHADOW=6`, and its `@log` lines match under
  `VL_IR_STRICT=1`.
