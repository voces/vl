# IR coverage: an earlier string operand, a literal included, staged below a valued `if` (2026-11-20, lane IR5)

A string concat, compare or accumulator append whose later operand holds a valued `if` refused
with `string operand after another` unless every earlier operand was a temp. Legacy writes the
earlier operand, then the `if`, in place; the IR read a variable or a literal at its use, above
the `if`'s value.

## The change

- **Both string-operand loops stage.** `buildStr` (`ir_build_ref.vl`) and `accAppend`
  (`ir_build.vl`) call the call arguments' staging (`stageLeadArgs`, exported as
  `irBStageLeads`; one function), recording each operand's start and node. A boxed `??`
  (`SCoalBox`) still refuses, as at a call.
- **A string literal stages.** The ablation at self-compile, master c2f0a97 fixpoint `mN`:
  staging alone released 3 of the 18 functions; the 15 others all had a literal lead (`"a=" +
  (if c { x } else { y })`), refused by `stageLeadArgs`'s `OStr` arm and by `RStage`'s verifier.
  IR6, who wrote #9227: the exclusion "was conservative, not a known hazard … a literal lead was
  never exercised, so I fenced it out".
- **The verifier's narrower clause.** An `OStr` stages only at its own rep (`dst ==
  opRep(sgV)`); the box-view escape is for a variable.

## Why a staged literal writes the same bytes

- `irLOpnd(OStr)` is `emitStrLitAt(osAt, fnIx)`: the pool global, the data segment, or the
  inline build, each chosen by lexeme from tables `collectStrPool` fills in arena order before
  any code is written. Nothing registers a literal at its first emission.
- No string tail reads an operand's literal-ness: `strCatTail`, `strSiteCatTail` and
  `strAccAppendTail` take a count and slots. The `eq` literal is the second operand and never a
  lead, so it is never staged.
- A staged root is written as the valued `if` opens, the point legacy writes the lead, so any
  scratch local an over-cap literal's inline build allocates is allocated in the same order.

## Witnesses

`tests/cases/strings/concat-literal-lead-valued-if.vl` (`buildStr`; `h` writes `"k="` staged and
unstaged in one function, IR6's case) and `accum-literal-lead-valued-if.vl` (`accAppend`): each
misses `string operand after another` under `mN` and is covered, verified and matched under the
armed shadow on the candidate; the concat module is byte-identical.
