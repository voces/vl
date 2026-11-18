# IR B4a: a plain scalar value `if`, 2026-11-18

Lane IR2. After B3 and the narrowed read, `expression if` was the self-compile's largest
single blocker (1,127 alone at B3). This step takes the share legacy's `emitIfExpr` lowers on
its plain scalar path. The returned value `if` is legacy's tail `if` and is left for B4b.

## What landed

- **`ifExprPlainKind(ifIx, fnIx)`**, beside `emitIfExpr`, is the blocktype byte legacy gives an
  `if` on its plain scalar path, or -1. It requires:
  - one value per arm and no `else if`;
  - no guard call;
  - no null, atom, union or ref join;
  - no integer switch;
  - no static `is` or literal-true condition;
  - no v128.
- **The builder (`ifExpr`)** builds such an `if` as a valued `SIf`. That is the slotless out
  each arm writes, the shape `&&` and `||` already lower through, so nothing in `ir.vl`,
  `ir_lower.vl` or `ir_verify.vl` changes. Each arm's value is `deliver`ed at the join's rep.
- **Three positions are named misses:**
  - `if after an operand`: the body ends in a waiting temp. The `if`'s value would sit beneath
    it on the stack.
  - `if into an element store`: the store builds its bounds check after its value.
  - `return of a value if`: legacy's `emitIfTail` writes each arm's value as its own exit.
    This is B4b's door, as the same `SIf` in return position.

## Coverage

Fixpoint seeds of master 0b8c7beb and of this step.

| reading | master | this step | gained |
|---|---:|---:|---:|
| self-compile covered = matched = claimed | 11,641 | 11,962 | **+321** |
| corpus covered = matched = claimed | 30,485 | 30,485 | 0 |

The corpus gains nothing: its value `if`s sit behind other misses, or are returned.

Next doors (blocker census, one class alone):
- `is guard` 644;
- `return of a value if` 570;
- `map read inline` 310;
- `expression if` 247;
- `index ref` 238.

Net compiler lines are +104 (+107, −3): 3.1 self-compile functions per line.

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; master's seed builds this source to it byte for byte; armed self-build identical |
| corpus identity | 9,030 identical, 3,267 fail under both, 0 differ; `--names` 0 differ; self-compile identical |
| `--claims`, mode 3 | 30,485 claimed, ok; mode 3 self and corpus identical |
| `--cases` | identical 7,435, fail under both 69, differ 0 |
| `tests/cases` and probes, armed | 35,615 covered, 35,615 matched |
| L2 self-compile fuel | 96,870,867,061 to 96,805,607,964 (−0.07%) |
| pin helpers, phase-state, ladder-sets | 904, ok, ok |
