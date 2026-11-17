# IR S1: `fromCodePoint` and `fromCodePoints` through legacy's encoder tails, 2026-11-17

Lane IR2. On master with F1 and IR-F2, the blocker census (`$VL_IR_SHADOW=4`, 45,669 corpus
functions, 25,738 with no blocker) is led by `intrinsic none`, 2,377 functions alone. A
throwaway that names the callee splits it: `fromCodePoints` 2,023 alone and 337 more beside a
walk's `break`, `fromCodePoint` 337, then `__str_from_bytes__`, `__trap__` and `__array_new__`
in single figures. The self-compile barely calls either; its leaders are `expression is` with
`local rep box`, list lengths and valued `if`s.

## What landed

- **Legacy's two writers split after their operands.** `fromCpTail` is the one-element
  code-point array and the `__utf8_enc__` call. `fcpBackingTail` is a list's backing and the
  start index, and `fcpLenTail` its length and the call. `emitCallCoreFromCodePoints` and
  `emitCallCoreFromCodePoint` end with them.
- **`RStrOp` takes `fromcp` and `fromcps`** (the `list` family, beside the string operators).
  - `fromcp` is built over an i32 operand.
  - `fromcps` is built over a local i32 list, which legacy reads twice by name. Its lowering
    writes the operand, the backing tail, the operand again and the length tail.
  - Every other list spelling legacy evaluates once into the scratch slot `fcpSpillStashSlot`
    (`callSpillsFcpArg`), and the builder names it (`code point list spill`). So the IR never
    reads that frame slot, and the claim-hazard question does not arise; a later step that
    builds the spill reserves the slot itself.
  - The verifier holds `fromcp` to an i32 and `fromcps` to a list of i32s.
- `StrOp` grows from 7 to 9 members in `compiler/lint.vl`.

## Pins

Shared witnesses, each one covered function that matches legacy: `fromCodePoint(c)`, and
`fromCodePoints` over a local `[104, 233, n]`. A literal list argument is a test of its own: the
named miss.

## Coverage

Each tree is built from its own fixpoint seed and its own checkout: IR-F2 (#8972), and this step.

| reading | IR-F2 | this step | gained |
|---|---:|---:|---:|
| corpus covered = matched (12,297 cells) | 25,738 | 28,098 | **+2,360** |
| self-compile covered = matched (armed) | 6,683 | 6,704 | +21 |
| first miss `intrinsic none`, corpus | 2,715 | 355 | −2,360 |
| self-compile claimed and shipped (`--claims`) | 2,215 | 2,218 | +3 |
| corpus claimed and shipped | 10,869 | 10,869 | 0: `RStrOp` is `list`, which is not claimed |

Net compiler lines are +72 (+85, −13): 33 corpus functions per line.

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; the armed self-build is byte-identical, 6,704 covered = matched; the claimed self-build reproduces its fixpoint |
| `--claims` | 0 fell back, self-compile and corpus |
| mode 3 with `list` and `map` admitted (throwaway build) | self-compile 6,704 claimed and byte-identical, 0 fell back; corpus 28,098 claimed, 9,029 identical, 0 differ, 0 fell back |
| corpus identity against IR-F2's seed | 9,029 identical, 3,268 fail under both, 0 differ |
| L2 self-compile fuel | 96,584,809,420 to 96,619,717,892 (+0.04%), +0.4% on the baseline |
| pin helpers in `emit_mono.vl` | 908 |
