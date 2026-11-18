# IR B4b design: the returned value `if` is the same `SIf` in return position, 2026-11-18

Lane IR2. This note is written before code, as the coordinator asked. B4a's `return of a value
if` miss holds 570 self-compile functions alone.

## What legacy does

`return if c { a } else { b }` (`emitReturnExit` → `emitIfTail`, when `lastStmtIsValueIf` or
`elseLessNullableTail` holds), and a body whose last statement is a valued `if`, both lower as:

1. the condition (`emitCondExpr`), then `if` with the void blocktype (0x40);
2. in each arm, its statements, with the last one tail-aware (`emitStmtsTail`):
   - a value is `emitTailReturnExit`: the value, then `return`, or `return_call` when it is a
     direct call, or the union sink;
   - a nested `if` recurses;
   - an `else if` continues along the chain's spine;
3. `end`, then `unreachable` when the result bears no `null`, or else the result's `null` and
   the union sink (`emitNullForRet`).

## What the IR builds

There is no new node, and no second builder path that mirrors `emitIfTail`. The returned `if`
is the statement `SIf` the builder already makes for `if c { return a } else { return b }`:

- `siOut` is -1 and the blocktype is void;
- each arm's statements are built as statements;
- the arm's last statement, when it is a value, becomes the `SReturn` a `return <value>`
  builds (`deliver` at the result rep), and a nested `if` recurses;
- an `else if` is the chain link the statement `if` already builds.

The tail is a property of where the `if` sits (a `return`'s argument, or a body's last
statement), not of a new kind of `if`.

## What the lowering needs, named before code

- **The per-arm `return` and `return_call`:** none new. The existing `ret` lowering already
  writes `return_call` for a direct call temp (and a retag of one), and `return` otherwise.
- **The trailing `unreachable`:** a body whose last node leaves (`irBodyLeaves`) already ends
  as legacy's does. The step checks this on the shadow first, and adds the `unreachable` to the
  `SIf`-in-return lowering only if the bytes show it is missing.
- **The null pad** (`emitNullForRet` after an `if` whose path falls through) is not taken. An
  else-less nullable tail stays a named miss.

## Named misses, so a shape the plain `SIf` cannot express never claims

- a static `is` condition, or its `!` (`staticIsGuard` decides it from the bytes it wrote);
- an integer `match` chain (`intMatchHeadAt`: `emitIntSwitch`'s `br_table`);
- a function taking the union return sink (`fnUses.unionSink`, `retIfIsOneNumber`);
- an else-less nullable tail (the null pad above);
- an arm whose last statement is neither a value nor an `if`.

## Bars

The coverage-step bars:
- byte identity;
- the shadow all-matched;
- mode 3;
- `--cases` 0 differ;
- the armed shadow over `tests/cases` and the probes;
- the first-miss histogram, with `return of a value if` falling.
