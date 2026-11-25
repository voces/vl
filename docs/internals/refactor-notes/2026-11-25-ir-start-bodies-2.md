# Start bodies, batch 2: an open scalar temp, an atom-assignment initializer (2026-11-25, lane COV-START)

After #10096's I8 red list, start bodies are the largest named bucket. The coordinator asked
COV-START and CENSUS to split them.

## The basis and the proposed split

The census probe on master (13:10) over all 27k programs finds 552 start-body first misses in 153
classes. COV-START proposed a split by first-miss class:
- COV-START: 34 classes, 222 units. These are the coercion, open-type, `global *`, pre-path and
  array spread/ref families.
- CENSUS: the other 119 classes, 330 units.

## The mechanisms, one commit each

- **A scalar temp typed at a still-open variable.** A generic function held in a map and called
  at two types gives a sum, `run([w], 2) + run([w], "ab").length`, typed `_` in the start body.
  Its rep is `i32`, which no instance changes. `irBLetTempTy` now types such a temp at its rep's
  own type, not missing on `open temp type`.
  - This covers 8 starts (D10383, D10384, D10400, D10401, ...).
- **An atom-assignment initializer of an i32 cell.** `const c = (k = "ww")` with `k: K` a literal
  union. The global section declares `c` an `i32`, and legacy stores the atom id the assignment
  yields. The IR now writes the assignment as a statement, then reads its target again at the atom
  (`irBExpr` of the left side), and notes the cell at that atom.
  - 6 of the 9 starts match byte for byte. The other 3 move to `global read coercion`.

## Measured, master → head

Same census probe and program lists; armed shadow over every program.

| reading | master | head |
|---|---:|---:|
| tests/cases start bodies claimed | 7,978 | 7,985 |
| witnesses start bodies claimed | 5,039 | 5,046 |
| `open temp type` start units | 23 | 15 |
| `global initializer atom assignment` start units | 9 | 0 |
| armed shadow mismatch, fail and fallback rows | 25 | 25, the same rows |

Three functions move from `open temp type` to `operand type`, also this lane's class.

## Found and sent on (lane SOUND)

- `function ret() { return c }` over the atom-assignment global `c` is claimed into an invalid
  module: the i32 atom cell is returned as a string. This is pre-existing on master.

## The sweep's other positions

The open-scalar sum's other positions are each their own start miss:
- union argument, concat and interpolation hole: `box ladder`, CENSUS's class;
- let initializer: `local rep unsup`;
- if arm: `rep unsup`;
- record field: `open local type`.
