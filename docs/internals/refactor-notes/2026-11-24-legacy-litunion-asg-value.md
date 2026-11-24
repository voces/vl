# Legacy: an assignment storing one member of a literal-union place is its re-read atom (2026-11-24, lane IR-N11, D17340 and D17281)

D17340: the checker types `o.f = "ww"` (`f: K`, `K = "zz" | "ww"`) as the lone literal `"ww"`, which
reps as a string, while the place reps as an atom. No `asgValueArmOf` arm accepted the pair, so
every value position refused (`... whose type is not its target's has no value lowering`). The
exceptions were a function's `let` and `return`, which `spillValueWrites` spills first.

- **`asgLitUnionMemberReRead` (emit_classify.vl)**: an assignment whose place is a literal union
  and whose type is a lone string literal re-reads its place (`assignTargetReReads`). The place
  holds the member's atom, and `exprIsLitAtom` already keys an assignment on
  `assignTargetReReads`, so `print`, a `string` binding, a concatenation and an interpolation
  each see the atom they expect of a `K` place.
- **`letWidensAtomToStr` (emit_fn_scans.vl)**: a binding annotated with a lone literal and
  initialized by an atom reserves the string-op frame. A captured one decodes through the
  tower, which reads scratch slot 0. This closes D17281 (IR-N8's clause-1 row, `unknown local`),
  the same frame gap reached by a field read instead of an assignment.
- **IR (ir_build.vl)**: such an assignment as a `==`/`!=` operand misses `assignment-value atom
  re-read as a compare operand`; legacy folds the atom compare by a route no IR compare writes.
  Every other position the IR covers either matches or misses at a class it already had.

## Measured

Base 38a6e3ca, both seeds fixpoints, each census arm built in a tree at its own commit.

- Legacy and shipped A/B over 8213 tests/cases and probe programs: the only movers are this PR's
  two pins, refused (exit 1) → run (exit 0); 8139 identical, no other byte moved.
- `check-filed-witnesses --strict`: 5688 graded, 5687 as filed, 1 MOVED: D17281
  `silent_invalid_wasm → runs`, closed here.
- Matrices, `--before`/`--after`, 0 `runs → not-runs` and 0 silent:
  - `litunion-member-assignment-value.matrix.vl`: 60 of 60 run, 49 cells refused → RUNS.
    `fn_body_capture` goes invalid module → RUNS. The non-member literal stays a check error.
  - `record-atom-field-read-as-string` and `variant-atom-field-read-as-string`: 48 of 48 each;
    the 8 annotated capture cells go invalid module → RUNS.
- Census: no existing function changed class. The new rows are the pins' own functions:
  `print operand rep` (`h`, `@init`) and `start: global initializer atom assignment`.

## Legacy tails the IR calls

None new: the IR declines the compare and builds the other positions through `assignValue`'s
existing re-read arm, which decodes a re-read atom where a `string` is delivered (`widenTo`).
