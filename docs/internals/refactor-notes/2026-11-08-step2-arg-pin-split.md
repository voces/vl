# Step 2: the argument pin split into its row arms and the elaboration's reader

Base: master `4a1d010d` with #6897 merged, built to a fixpoint (6,579,943 bytes). Population: the
23,736 programs of `scripts/sweep.vl -- list`, each built once with `$VL_REP_SHADOW` by a scratch
seed that was never committed. Counts are answers at a site, not programs. This follows shadow B of
`2026-11-08-step2-arg-coverage.md`.

## The split

`monoArgPinTyIx` answered two questions in one ladder. Its row arms (`null` for an unfilled read
or a parameter pinned at `null`, the variant an unadopted literal was pinned at, the record the
record solve built a literal at, `elabArgBuiltRep`, a record copy's type) name the row the value is
built at. Its other arms (the own type, a function value's own or instance type) name the node's
type. The row arms are now one function, `monoArgRowArmTy`. The new `monoArgPinTyAt` answers `null`
or the row arm, then `elabNodeTyOrChecked`, then the open checked type. `monoArgPinTyIx` keeps its
order for the callers outside this lane (`monoPinHoleParam`, `monoPinTyParamComposite`).

Switched onto `monoArgPinTyAt`: `monoArgClosedPinTy`, and the three pin-type sites of
`monoPinAnnotatedParam`: the concrete annotation, the `T` parameter's fallback, and the `T[]` list.

## Shadow: the old pin against the split, per site

| site | same | `tySame` | old open, new closed | open, renamed | D6544 |
|---|---|---|---|---|---|
| `monoArgClosedPinTy` (the `[type, record]` answer) | 17,240 | 46 | 0 | 0 | 3 |
| annotated, `T` fallback | 14,381 | 38 | 1,313 | 11 | 3 |
| annotated, concrete | 3,313 | 4 | 10 | 0 | 0 |
| annotated, `T[]` list | 1,632 | 35 | 267 | 1 | 0 |

The record flag agreed at every `monoArgClosedPinTy` answer. "Old open" means the old pin banked a
type variable (`T`, `U[]`, `_`, `__W0`, `T__sh4`, ...) where the reader has the instance's closed
type. The sweep moved 0 modules, so neither answer reaches one: an open bank is closed
downstream (`monoExactPinTys`, and `monoArgClosedTyIn`'s open arm). "Open, renamed" banks another open type (`T ~ A`, `U ~ V`).

D6544 (`tests/cases/generics/hole-call-of-generic-at-its-own-instance.vl`): the elaboration types
the `1` in `a(2.5, 1)` as `f64`, and the old pin types it as `i32`. Its module does not move (0
bytes-only movers), so this switch changes no output there. The pin's NAME still comes from the
name ladder (`monoArgPinName`, `monoArgTyName`), and the instance is keyed by it. D6544 moves when
that side is switched.

## Deleted

The row arms' second copy, `monoLitBuiltTy` (folded into `monoArgRowArmTy`), and
`monoTyIsArrayShaped` (its one caller now reads the shape inline). The two switched functions no
longer reach `monoArgPinTyIx`.

## Graded

Sweep, base against candidate: 23,736 of 23,736 the same, 0 bytes-only movers, 0 output movers.
Fixpoint: a second refresh is byte-identical. Seed 6,579,943 → 6,580,021 bytes (+78). Pin-helper
budget 921 → 921 (two added, two deleted).
