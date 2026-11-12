# Step 7: `arrLitElemKindTpl` deleted, a list literal's element kind is read by type, 2026-11-12

`arrLitElemKind` (`emit_value_sites.vl`) answers, in order:
1. the literal's frame type;
2. its recorded type (for an emitter-made run, its holder's);
3. its closed instance type: `litRepTyOneClosed`, else the kind every type in `elabNodeInstTys`
   agrees on.

The shape reader `arrLitElemKindTpl` is deleted. A literal none of the three closes is an emit
failure, which no sweep cell reaches.

## The last 7 cells

Each has an element that is a hole or a type parameter in its recorded type.

| cells | recorded | instance type | shape reader | by type |
| --- | --- | --- | --- | --- |
| four `d581_*_typar` named cells | `T[]` | `V[]` | 1 | 1 |
| D15637, `hole-param-called-and-handed-on-in-nested-list.vl` | `_[][]` | `((_) => _)[][]` | 4 | 9 |
| `return-join-nested-type-param-list.vl` | `T[][]` | `f64[][]` | 4 | 7 |

In the last three rows the shape reader and the type disagree, yet the module is unchanged.

## Measurement

Fixpoint seeds on both sides, over the whole sweep population; the base is #7314's tree. The
instance rung alone and the deletion each come out the same: same 23,933, bytes-only 0, output
movers 0, runs → not-runs 0, new compiler traps 0. No cell reaches the failure.
