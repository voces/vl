# Postfix `++` / `--` (2026-11-25, lane COV-START, from START-2's share)

`unary p+`: 6 start units on the census of master 24d858b7, taken over from START-2. The parser
wraps a postfix `x++` in a `Unary "p+"` (`"p-"` for `--`) over its increment: the assignment
`x = x + 1`, or a field or element place's prefix increment. The IR had neither the statement nor
the value form, in a start body or in a function.

## The mechanisms, one commit each

- **As a statement** (`stmtNode`), the old value is discarded, so the statement is its increment,
  built as that statement. This is legacy's `emitStmt` unwrap.
- **For its value** (`postfixValue`), the old value: the increment as an expression (its new
  value), then the step undone at the place's width (`- 1` for `++`, `+ 1` for `--`, the one an
  immediate at i32, i64, f64 or f32). This is legacy's `emitUnary` arm, including its D16216
  width rule.

## Measured, on the class's programs

| program | master | head |
|---|---|---|
| D16216, D4055 | `unary p+` | claimed |
| `assignment/postfix-incr-on-field-and-element-runs` | `unary p+` | claimed |
| `operators/unary` | `unary p+` | claimed |
| `scope/module-let-shadowed-by-loop-variable` | `unary p+` | claimed |
| `variables/let-increment-ok` | `unary p+` | claimed |

Each matches legacy byte for byte under the armed shadow, with the same output under
`VL_IR_STRICT=1`. Sweep: `tests/cases/operators/postfix-incr-positions.vl`.
